import * as demo from '../data/mockData'
import { buildAnswer } from '../services/copilotService'
import {
  computeStats,
  filterZones,
  measureAreaKm2,
  measureDistanceKm,
  sizeClass,
} from './calculations'
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
  })

  test('Nepali answers use Nepali place names', () => {
    expect(buildAnswer('cut-off', 'np', stats).answer).toContain('स्याफ्रुबेसी')
  })
})
