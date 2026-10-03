import * as demo from '../data/mockData'
import { buildAnswer, matchQuestion } from '../services/copilotService'
import {
  calculateRescuePriority,
  commonFactors,
  computeStats,
  priorityFactors,
  rankPriority,
  filterZones,
  measureAreaKm2,
  measureDistanceKm,
  sizeClass,
  summarisePriority,
  zoneFilterExpression,
} from './calculations'
import { FIRST_LABEL_LAYER, loadMapStyle } from '../config/mapConfig'
import { DEFAULT_FILTERS } from './constants'

const stats = computeStats(demo)

describe('computeStats on the demo dataset', () => {
  test('derives the headline figures', () => {
    expect(stats.floodedAreaKm2).toBe(42.3)
    expect(stats.damagedStructures).toBe(1247)
    expect(stats.damagedRoadKm).toBe(6.2)
    expect(stats.populationAffected).toBe(3560)
  })

  test('counts damaged infrastructure and cut-off settlements', () => {
    expect(stats.bridgesDestroyed).toHaveLength(3)
    expect(stats.healthPostsUnreachable).toHaveLength(2)
    expect(stats.cutOff).toHaveLength(5)
    expect(stats.priority[0].name).toBe('Syabrubesi')
  })

  test('area by type adds up to the total', () => {
    const { water, debris, uncertain } = stats.areaByType
    expect(water + debris + uncertain).toBeCloseTo(stats.floodedAreaKm2, 0)
  })
})

describe('rescue priority', () => {
  test('applies the factor weights', () => {
    const settlement = {
      population: 1000, // 50 -> 17.5
      damaged: 50,
      total: 100, // 50 -> 12.5
      access_difficulty: 5, // 100 -> 20
      healthPostUnreachable: true, // 50 -> 7.5
      children: 100,
      elderly: 100, // 20 -> 1
    }
    expect(calculateRescuePriority(settlement)).toBe(59)
  })

  test('caps population and scores only the factors that have data', () => {
    // Population alone: its weight is rescaled to the whole score.
    expect(calculateRescuePriority({ population: 50000 })).toBe(100)
    // Population 50 and damage 20, weights 35 and 25 rescaled over 60.
    expect(calculateRescuePriority({ population: 1000, damaged: 20, total: 100 })).toBe(38)
    expect(calculateRescuePriority({})).toBe(0)
    expect(priorityFactors({ population: null })).toEqual({})
    // No mapped buildings: size 0 and no damage, not "unknown".
    expect(priorityFactors({ population: null, total: 0 })).toEqual({ buildings: 0, damage: 0 })
  })

  test('sizes a settlement by mapped buildings when its population is not recorded', () => {
    // 200 of a saturating 400 buildings -> 50; damage 20; weights 35 and 25 over 60.
    expect(calculateRescuePriority({ population: null, damaged: 40, total: 200 })).toBe(38)
    // Residents win over buildings when both are known.
    expect(calculateRescuePriority({ population: 2000, damaged: 0, total: 4 })).toBe(58)
    const rows = [
      { population: 900, total: 40, damaged: 10 },
      { population: null, total: 300, damaged: 30 },
    ]
    expect(commonFactors(rows)).toEqual(['damage', 'buildings'])
    expect(commonFactors([rows[0]])).toEqual(['population', 'damage'])
  })

  test('ranks the cut-off demo settlements', () => {
    expect(stats.priority.map((p) => [p.rank, p.name, p.priority, p.band])).toEqual([
      [1, 'Syabrubesi', 81, 'critical'],
      [2, 'Timure', 54, 'medium'],
      [3, 'Rasuwagadhi', 43, 'medium'],
      [4, 'Ghattekhola', 42, 'medium'],
      [5, 'Lingling', 25, 'low'],
    ])
  })

  test('takes bridge and health post status from the infrastructure layer', () => {
    const byName = Object.fromEntries(stats.priority.map((p) => [p.name, p]))
    expect(byName.Syabrubesi).toMatchObject({ bridgeDestroyed: true, healthPostUnreachable: true })
    expect(byName.Timure).toMatchObject({ bridgeDestroyed: false, healthPostUnreachable: true })
    expect(byName.Lingling).toMatchObject({ bridgeDestroyed: false, healthPostUnreachable: false })
  })
})

describe('pipeline-shaped data', () => {
  // A run can leave road access and population unknown, and has no infrastructure layer.
  const run = computeStats({
    floodZones: demo.floodZones,
    roads: demo.roads,
    buildings: { type: 'FeatureCollection', features: [] },
    infrastructure: [],
    satelliteData: { before: { date: '2026-08-24' }, after: { date: '2026-09-05' } },
    settlements: [
      { id: 'a', name: 'Alpha', lat: 28, lng: 85, population: 400, connected: false },
      { id: 'b', name: 'Beta', lat: 28, lng: 85, population: null, connected: false },
      { id: 'c', name: 'Gamma', lat: 28, lng: 85, population: 900, connected: null },
      { id: 'd', name: 'Delta', lat: 28, lng: 85, population: 150, connected: true },
    ],
  })

  test('unknown road access is neither cut off nor connected', () => {
    expect(run.cutOff.map((s) => s.name)).toEqual(['Alpha', 'Beta'])
    expect(run.unknownAccess.map((s) => s.name)).toEqual(['Gamma'])
    expect(run.connected.map((s) => s.name)).toEqual(['Delta'])
    expect(run.priority.map((p) => p.name)).not.toContain('Gamma')
  })

  test('road length counts the part inside a flood zone, not the whole segment', () => {
    const road = (name, damaged, length_km, flooded_km) => ({ properties: { name, damaged, length_km, flooded_km } })
    const withLengths = computeStats({
      floodZones: demo.floodZones,
      buildings: { type: 'FeatureCollection', features: [] },
      infrastructure: [],
      settlements: [],
      roads: { features: [road('A', true, 5, 0.12), road('A', true, 3, 0.2), road('B', true, 2, 0.05), road('C', false, 9, 0)] },
    })
    expect(withLengths.damagedRoadKm).toBe(0.4)
    expect(withLengths.totalRoadKm).toBe(19)
    expect(withLengths.damagedRoadGroups.map((g) => [g.name, g.length_km, g.sections])).toEqual([
      ['A', 0.32, 2],
      ['B', 0.05, 1],
    ])
  })

  test('a missing population is reported, not counted as zero people', () => {
    expect(run.populationAffected).toBe(400)
    expect(run.populationUnknown).toBe(1)
    expect(run.sizeBasis).toBe('buildings')
    expect(stats.sizeBasis).toBe('population')
  })

  test('settlements are scored on the same factors, so a data gap cannot lift a rank', () => {
    const rows = [
      { id: 'a', name: 'Big', population: 1700, connected: false, total: 2, damaged: 1 },
      { id: 'b', name: 'Unknown', population: null, connected: false, total: 1, damaged: 1 },
    ]
    const ranked = rankPriority(rows)
    // Population is missing for one, so both are sized by mapped buildings instead.
    expect(ranked.every((p) => p.factorsUsed.join() === 'damage,buildings')).toBe(true)
    // (25 * damage + 35 * size) / 60, with size = buildings / 400
    expect(ranked.map((p) => [p.name, p.priority])).toEqual([['Unknown', 42], ['Big', 21]])
    expect(summarisePriority(ranked).map((b) => [b.buildings, b.peopleUnknown])).toEqual([[1, 1], [2, 0]])
    // With population known for both, it counts again.
    const known = rankPriority([rows[0], { ...rows[1], population: 100 }])
    expect(known[0].factorsUsed).toEqual(['population', 'damage'])
    expect(known[0].name).toBe('Big')
  })

  test('an absent infrastructure layer is not read as "nothing destroyed"', () => {
    expect(run.infrastructureAssessed).toBe(false)
    expect(run.priority[0].bridgeDestroyed).toBeUndefined()
    for (const language of ['en', 'np']) {
      expect(buildAnswer('infrastructure', language, run).answer).not.toMatch(/\(0\)/)
    }
    expect(buildAnswer('infrastructure', 'en', run).answer).toContain('not assessed')
  })

  test('dates and wording come from the run', () => {
    expect(run.imagery).toEqual({ before: '2026-08-24', after: '2026-09-05' })
    expect(buildAnswer('flood-extent', 'en', run).answer).toMatch(/24 Aug 2026 → 5 Sept? 2026/)
    expect(buildAnswer('flood-extent', 'np', run).answer).toContain('5 सेप्टेम्बर 2026')
    const cutOff = buildAnswer('cut-off', 'en', run).answer
    expect(cutOff).toContain('Access unknown')
    // Population is missing for a cut-off settlement, so sizes are given in mapped buildings.
    expect(cutOff).toContain('Beta: 0 mapped buildings')
    expect(cutOff).toContain('no head count is given')
    expect(cutOff).not.toMatch(/residents|people/)
    expect(buildAnswer('priority', 'en', run).answer).toContain('Not scored, because the data is missing')
  })
})

describe('filterZones', () => {
  const zones = demo.floodZones.features

  test('default threshold hides low-confidence zones', () => {
    const shown = filterZones(zones, DEFAULT_FILTERS)
    expect(shown.length).toBeLessThan(zones.length)
    expect(shown.every((z) => z.properties.confidence >= 0.5)).toBe(true)
  })

  test('filters by type and size', () => {
    const filters = { confidence: 0, types: { water: false, debris: true, uncertain: false }, size: 'small' }
    const shown = filterZones(zones, filters)
    expect(shown.length).toBeGreaterThan(0)
    expect(shown.every((z) => z.properties.type === 'debris' && sizeClass(z.properties.area_km2) === 'small')).toBe(true)
  })
})

describe('zoneFilterExpression', () => {
  test('encodes threshold, enabled types and size limits', () => {
    const filters = { confidence: 70, types: { water: true, debris: false, uncertain: true }, size: 'medium' }
    expect(zoneFilterExpression(filters)).toEqual([
      'all',
      ['>=', ['get', 'confidence'], 0.7],
      ['in', ['get', 'type'], ['literal', ['water', 'uncertain']]],
      ['>=', ['get', 'area_km2'], 2],
      ['<', ['get', 'area_km2'], 4.5],
    ])
  })

  test('adds no size clause for all sizes', () => {
    expect(zoneFilterExpression(DEFAULT_FILTERS)).toHaveLength(3)
  })
})

describe('loadMapStyle', () => {
  const layerIds = (style) => style.layers.map((layer) => layer.id)
  afterEach(() => vi.unstubAllGlobals())

  test('imagery basemaps get the shared label layers', async () => {
    for (const id of ['sentinel', 'imagery']) {
      const style = await loadMapStyle(id, false)
      expect(style.glyphs).toContain('{fontstack}')
      expect(style.layers[0].type).toBe('raster')
      expect(layerIds(style)).toEqual(expect.arrayContaining([FIRST_LABEL_LAYER, 'label-village', 'label-district']))
    }
  })

  test('falls back to a plain labelled style when the street style cannot be fetched', async () => {
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new Error('offline')))
    const style = await loadMapStyle('street', true)
    expect(layerIds(style)).toEqual(expect.arrayContaining(['background', FIRST_LABEL_LAYER]))
  })

  test('street style keeps its map layers but swaps in the shared labels', async () => {
    const fetched = {
      version: 8,
      sources: { openmaptiles: { type: 'vector', url: 'x' } },
      layers: [
        { id: 'water', type: 'fill', source: 'openmaptiles', 'source-layer': 'water' },
        { id: 'place_village', type: 'symbol', source: 'openmaptiles', 'source-layer': 'place' },
      ],
    }
    const fetch = vi.fn().mockResolvedValue({ ok: true, json: async () => fetched })
    vi.stubGlobal('fetch', fetch)
    const style = await loadMapStyle('street', true)
    expect(fetch).toHaveBeenCalledWith(expect.stringMatching(/styles\/dark$/))
    expect(layerIds(style)).toContain('water')
    expect(layerIds(style)).not.toContain('place_village')
    expect(layerIds(style)).toContain('label-village')
  })
})

describe('measurement', () => {
  test('distance along one degree of latitude is about 111 km', () => {
    expect(measureDistanceKm([[85, 28], [85, 29]])).toBeCloseTo(111.2, 0)
  })

  test('area needs three points', () => {
    expect(measureAreaKm2([[85, 28], [85.01, 28]])).toBe(0)
    expect(measureAreaKm2([[85, 28], [85.01, 28], [85.01, 28.01], [85, 28.01]])).toBeCloseTo(1.09, 1)
  })
})

describe('matchQuestion', () => {
  test.each([
    ['Which settlement needs rescue most urgently?', 'priority'],
    ['How many bridges and roads are damaged?', 'infrastructure'],
    ['which villages are cut off', 'cut-off'],
    ['Where did the flood hit?', 'flood-extent'],
    ['कुन बस्ती सम्पर्कविहीन छन्?', 'cut-off'],
    ['What is the weather tomorrow?', null],
  ])('%s -> %s', (text, topic) => {
    expect(matchQuestion(text)).toBe(topic)
  })
})

describe('priority summary', () => {
  test('counts settlements and people per band, skipping empty bands', () => {
    expect(summarisePriority(stats.priority).map((b) => [b.id, b.count, b.people])).toEqual([
      ['critical', 1, 1700],
      ['medium', 3, 1550],
      ['low', 1, 310],
    ])
  })

  test('confidence per damage type is an area-weighted mean within its range', () => {
    for (const { mean, min, max } of Object.values(stats.confidenceByType)) {
      expect(mean).toBeGreaterThanOrEqual(min)
      expect(mean).toBeLessThanOrEqual(max)
    }
  })
})

describe('copilot answers', () => {
  test.each(['en', 'np'])('quote the dashboard figures (%s)', (language) => {
    expect(buildAnswer('flood-extent', language, stats).answer).toContain('42.3')
    expect(buildAnswer('infrastructure', language, stats).answer).toContain('1,247')
    expect(buildAnswer('cut-off', language, stats).answer).toContain('3,560')
    expect(buildAnswer('priority', language, stats).answer).toMatch(/^.*\n\n1\. /)
    expect(buildAnswer('priority', language, stats).answer).toContain('81/100')
  })

  test('Nepali answers use Nepali place names', () => {
    expect(buildAnswer('cut-off', 'np', stats).answer).toContain('स्याफ्रुबेसी')
  })
})
