import * as demo from '../data/mockData'
import { buildAnswer } from '../services/copilotService'
import {
  calculateRescuePriority,
  computeStats,
  filterZones,
  measureAreaKm2,
  measureDistanceKm,
  sizeClass,
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

  test('caps population and tolerates missing fields', () => {
    expect(calculateRescuePriority({ population: 50000, damaged: 0, total: 0 })).toBe(39)
    expect(calculateRescuePriority({})).toBe(4)
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
