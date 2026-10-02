import { area, length, lineString, polygon } from '@turf/turf'
import { SIZE_LIMITS } from './constants'

const round = (n, d = 1) => Math.round(n * 10 ** d) / 10 ** d
const sum = (items, pick) => items.reduce((total, item) => total + pick(item), 0)

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

// Cut-off settlements ordered by population × share of structures damaged.
export function rankPriority(settlementRows) {
  return settlementRows
    .filter((s) => !s.connected)
    .map((s) => {
      const damageRatio = s.total ? s.damaged / s.total : 0
      return { ...s, damageRatio, score: s.population * damageRatio }
    })
    .sort((a, b) => b.score - a.score)
}

export function computeStats({ floodZones, buildings, roads, settlements, infrastructure }) {
  const zones = floodZones.features.map((f) => f.properties)
  const areaOf = (type) => sum(zones.filter((z) => z.type === type), (z) => z.area_km2)
  const totalArea = sum(zones, (z) => z.area_km2)

  const settlementRows = structuresBySettlement(buildings, settlements)
  const cutOff = settlementRows.filter((s) => !s.connected)

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
    meanConfidence: totalArea ? sum(zones, (z) => z.confidence * z.area_km2) / totalArea : 0,
    zones: [...zones].sort((a, b) => b.area_km2 - a.area_km2),

    damagedStructures: sum(settlementRows, (s) => s.damaged),
    totalStructures: sum(settlementRows, (s) => s.total),
    settlementRows,

    damagedRoadKm: round(sum(damagedRoads, (r) => r.length_km)),
    totalRoadKm: round(sum(roadSections, (r) => r.length_km)),
    damagedRoads,

    populationAffected: sum(cutOff, (s) => s.population),
    cutOff,
    connected: settlementRows.filter((s) => s.connected),
    priority: rankPriority(settlementRows),

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
