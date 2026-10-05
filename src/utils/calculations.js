import { area, length, lineString, polygon } from '@turf/turf'
import { USE_MOCK } from '../config/apiConfig'
import { EVENT, PRIORITY_BANDS, PRIORITY_WEIGHTS, SIZE_LIMITS } from './constants'

const round = (n, d = 1) => Math.round(n * 10 ** d) / 10 ** d
const sum = (items, pick) => items.reduce((total, item) => total + pick(item), 0)
// A pipeline run records how much of a flagged segment lies inside a flood zone.
// Where that is absent (the demo data) the whole section counts.
const floodedKm = (road) => road.flooded_km ?? road.length_km

export function sizeClass(areaKm2) {
  if (areaKm2 >= SIZE_LIMITS.large) return 'large'
  if (areaKm2 < SIZE_LIMITS.small) return 'small'
  return 'medium'
}

export function filterZones(features, filters) {
  return features.filter(({ properties: p }) => {
    if (p.confidence < filters.confidence / 100) return false
    if (!filters.types[p.type]) return false
    return filters.size === 'all' || sizeClass(p.area_km2) === filters.size
  })
}

// The same rules as filterZones, as a MapLibre layer filter evaluated on the GPU side.
export function zoneFilterExpression(filters) {
  const types = Object.keys(filters.types).filter((type) => filters.types[type])
  const area = ['get', 'area_km2']
  const expression = [
    'all',
    ['>=', ['get', 'confidence'], filters.confidence / 100],
    ['in', ['get', 'type'], ['literal', types]],
  ]
  if (filters.size === 'large') expression.push(['>=', area, SIZE_LIMITS.large])
  if (filters.size === 'small') expression.push(['<', area, SIZE_LIMITS.small])
  if (filters.size === 'medium') {
    expression.push(['>=', area, SIZE_LIMITS.small], ['<', area, SIZE_LIMITS.large])
  }
  return expression
}

// Per-settlement structure counts, taken from the building footprints.
export function structuresBySettlement(buildings, settlements) {
  const counts = new Map(settlements.map((s) => [s.id, { total: 0, damaged: 0 }]))
  for (const { properties: p } of buildings.features) {
    const row = counts.get(p.settlement_id)
    if (!row) continue
    row.total += 1
    if (p.damaged) row.damaged += 1
  }
  return settlements.map((s) => ({ ...s, ...counts.get(s.id) }))
}

// Settlement size can be scored from residents or, where the population is not
// recorded, from mapped buildings. Either carries the population weight.
export const FACTOR_WEIGHTS = { ...PRIORITY_WEIGHTS, buildings: PRIORITY_WEIGHTS.population }
const SIZE_FACTORS = ['population', 'buildings']

// The 0-100 factor scores behind the rescue priority. A factor is returned only
// when the data carries its input; nothing is assumed for a missing one.
export function priorityFactors(s) {
  const factors = {}
  // Saturates at 2,000 residents
  if (s.population != null) factors.population = Math.min(s.population / 2000, 1) * 100
  if (s.total != null) {
    // Saturates at 400 mapped buildings
    factors.buildings = Math.min(s.total / 400, 1) * 100
    factors.damage = s.total ? ((s.damaged ?? 0) / s.total) * 100 : 0
  }
  // 1 = vehicle track (20) to 5 = helicopter only (100)
  if (s.access_difficulty != null) factors.access = (s.access_difficulty / 5) * 100
  const critical = [
    [s.healthPostUnreachable, 50],
    [s.bridgeDestroyed, 30],
    [s.water_source_cut, 20],
  ].filter(([known]) => known != null)
  if (critical.length) factors.critical = sum(critical, ([hit, points]) => (hit ? points : 0))
  if (s.population && s.children != null && s.elderly != null) {
    factors.vulnerable = Math.min(((s.children + s.elderly) / s.population) * 100, 100)
  }
  return factors
}

// Weighted rescue priority, 0-100. When some factors have no data, the weights
// of the remaining ones are rescaled to add up to 1. `only` restricts the score
// to a given set of factors, so that settlements are compared on the same ones.
export function calculateRescuePriority(settlement, only) {
  const available = priorityFactors(settlement)
  // On its own, a settlement is sized by residents when known, else by buildings.
  const use = only ?? Object.keys(available).filter((f) => f !== ('population' in available ? 'buildings' : 'population'))
  const factors = Object.entries(available).filter(([f]) => use.includes(f))
  const score = sum(factors, ([factor, value]) => value * FACTOR_WEIGHTS[factor])
  if (factors.length === Object.keys(PRIORITY_WEIGHTS).length) return Math.round(score)
  const weight = sum(factors, ([factor]) => FACTOR_WEIGHTS[factor])
  return weight ? Math.round(score / weight) : 0
}

// The factors every one of the rows has data for, with one measure of size:
// residents if all rows have them, otherwise mapped buildings for all rows.
export function commonFactors(rows) {
  const common = Object.keys(FACTOR_WEIGHTS).filter((f) => rows.every((row) => f in priorityFactors(row)))
  const size = SIZE_FACTORS.find((f) => common.includes(f))
  return common.filter((f) => !SIZE_FACTORS.includes(f) || f === size)
}

export function priorityBand(score) {
  return PRIORITY_BANDS.find((band) => score > band.above)
}

// Cut-off settlements ranked by rescue priority, highest first.
export function rankPriority(settlementRows, infrastructure = []) {
  const damagedAt = (settlementId, type) =>
    infrastructure.some(
      (item) => item.settlement_id === settlementId && item.type === type && item.status !== 'operational',
    )
  const rows = settlementRows
    .filter((s) => s.connected === false)
    .map((s) => ({
      ...s,
      damageRatio: s.total ? s.damaged / s.total : 0,
      // With no infrastructure layer these are unknown, not "intact".
      healthPostUnreachable: infrastructure.length ? damagedAt(s.id, 'health_post') : undefined,
      bridgeDestroyed: infrastructure.length ? damagedAt(s.id, 'bridge') : undefined,
    }))
  // Only factors every settlement has data for are scored: a settlement missing
  // its population must not outrank others by being scored on damage alone.
  const factorsUsed = commonFactors(rows)
  return rows
    .map((row) => {
      const priority = calculateRescuePriority(row, factorsUsed)
      return { ...row, priority, band: priorityBand(priority).id, factorsUsed }
    })
    .sort((a, b) => b.priority - a.priority || (b.population ?? 0) - (a.population ?? 0))
    .map((row, index) => ({ ...row, rank: index + 1 }))
}

function meanConfidence(zones) {
  const totalArea = sum(zones, (z) => z.area_km2)
  return totalArea ? sum(zones, (z) => z.confidence * z.area_km2) / totalArea : 0
}

// People and settlements per priority band, for bands that have any.
export function summarisePriority(priority) {
  return PRIORITY_BANDS.map((band) => {
    const members = priority.filter((p) => p.band === band.id)
    return {
      ...band,
      count: members.length,
      people: sum(members, (p) => p.population ?? 0),
      buildings: sum(members, (p) => p.total ?? 0),
      peopleUnknown: members.filter((p) => p.population == null).length,
    }
  }).filter((band) => band.count > 0)
}

// Acquisition dates of the before/after scenes. Only the demo falls back to the
// event's nominal dates; a pipeline run without scene records has none.
export function imageryDates(satelliteData) {
  return {
    before: satelliteData?.before?.date ?? (USE_MOCK ? EVENT.beforeDate : null),
    after: satelliteData?.after?.date ?? (USE_MOCK ? EVENT.afterDate : null),
  }
}

export function computeStats({ floodZones, buildings, roads, settlements, infrastructure, satelliteData }) {
  const zones = floodZones.features.map((f) => f.properties)
  const areaOf = (type) => sum(zones.filter((z) => z.type === type), (z) => z.area_km2)
  const totalArea = sum(zones, (z) => z.area_km2)

  const settlementRows = structuresBySettlement(buildings, settlements)
  const cutOff = settlementRows.filter((s) => s.connected === false)

  const roadSections = roads.features.map((f) => f.properties)
  const damagedRoads = roadSections.filter((r) => r.damaged)

  const damagedInfra = (type) =>
    infrastructure.filter((i) => i.type === type && i.status !== 'operational')

  return {
    floodedAreaKm2: round(totalArea),
    areaByType: {
      water: round(areaOf('water')),
      debris: round(areaOf('debris')),
      uncertain: round(areaOf('uncertain')),
    },
    meanConfidence: meanConfidence(zones),
    // Area-weighted mean and range of model confidence per damage type
    confidenceByType: Object.fromEntries(
      ['water', 'debris', 'uncertain'].map((type) => {
        const ofType = zones.filter((z) => z.type === type)
        const values = ofType.map((z) => z.confidence)
        return [
          type,
          {
            mean: meanConfidence(ofType),
            min: values.length ? Math.min(...values) : 0,
            max: values.length ? Math.max(...values) : 0,
          },
        ]
      }),
    ),
    zones: [...zones].sort((a, b) => b.area_km2 - a.area_km2),

    damagedStructures: sum(settlementRows, (s) => s.damaged),
    totalStructures: sum(settlementRows, (s) => s.total),
    settlementRows,

    damagedRoadKm: round(sum(damagedRoads, floodedKm)),
    // Damaged sections merged by road name, longest first: real data has hundreds of segments
    damagedRoadGroups: Object.values(
      damagedRoads.reduce((groups, r) => {
        const group = (groups[r.name] ??= { id: r.name, name: r.name, name_np: r.name_np, length_km: 0, sections: 0 })
        group.length_km = round(group.length_km + floodedKm(r), 2)
        group.sections += 1
        return groups
      }, {}),
    ).sort((a, b) => b.length_km - a.length_km),
    totalRoadKm: round(sum(roadSections, (r) => r.length_km)),
    damagedRoads,

    populationAffected: sum(cutOff, (s) => s.population ?? 0),
    // 'population' only when it is recorded for every cut-off settlement (or, with
    // none cut off, for every settlement); otherwise sizes are given in mapped buildings.
    sizeBasis: (cutOff.length ? cutOff : settlementRows).every((s) => s.population != null)
      ? 'population'
      : 'buildings',
    buildingsInCutOff: sum(cutOff, (s) => s.total),
    // Cut-off settlements whose population the source does not record
    populationUnknown: cutOff.filter((s) => s.population == null).length,
    cutOff,
    connected: settlementRows.filter((s) => s.connected === true),
    // No road reached these in the pre-event map, so the flood's effect is unknown
    unknownAccess: settlementRows.filter((s) => s.connected == null),
    priority: rankPriority(settlementRows, infrastructure),

    imagery: imageryDates(satelliteData),
    // What the run calls its area; the demo dataset is the Trishuli case study
    areaName: satelliteData?.area?.name ?? null,
    // How the run compared with a reference map, when that check was made; null otherwise
    validation: satelliteData?.validation ?? null,

    // False when the run produced no infrastructure layer: counts below are then not findings
    infrastructureAssessed: infrastructure.length > 0,
    // A pipeline run maps bridges and health facilities but not power lines
    powerLinesAssessed: infrastructure.some((i) => i.type === 'power_line'),
    bridgesDestroyed: damagedInfra('bridge'),
    healthPostsUnreachable: damagedInfra('health_post'),
    powerLinesDown: damagedInfra('power_line'),
    powerLineKmDown: round(sum(damagedInfra('power_line'), (i) => i.length_km ?? 0)),
  }
}

// points are [lng, lat] pairs
export function measureDistanceKm(points) {
  return points.length < 2 ? 0 : length(lineString(points), { units: 'kilometers' })
}

export function measureAreaKm2(points) {
  return points.length < 3 ? 0 : area(polygon([[...points, points[0]]])) / 1e6
}
