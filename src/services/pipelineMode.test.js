// With VITE_DATA_URL set, every dataset is read from the pipeline's static files.
vi.mock('../config/apiConfig', async (original) => ({
  ...(await original()),
  DATA_URL: '/data',
  DATA_MODE: 'pipeline',
  USE_MOCK: false,
}))

import { DATA_PARTS, loadDamageData } from '../hooks/useDamageData'
import { useDataStore } from '../store/dataStore'

const FILES = {
  '/data/satellite.json': { event: '2026-08-26', before: { date: '2026-08-24' }, after: null },
  '/data/flood_zones.geojson': { type: 'FeatureCollection', features: [] },
  '/data/buildings.geojson': { type: 'FeatureCollection', features: [] },
  '/data/roads.geojson': { type: 'FeatureCollection', features: [] },
  '/data/infrastructure.json': [],
  '/data/settlements.json': [{ id: 's001', name: 'Dhunche', population: null, connected: null }],
}

afterEach(() => vi.unstubAllGlobals())

test('loads the six datasets from the data folder', async () => {
  const fetch = vi.fn(async (url) => ({ ok: url in FILES, status: url in FILES ? 200 : 404, json: async () => FILES[url] }))
  vi.stubGlobal('fetch', fetch)

  const loaded = {}
  for (const [part, load] of Object.entries(DATA_PARTS)) loaded[part] = await load()

  // context.json is the one optional file: asked for, and a run without it is fine
  expect(fetch.mock.calls.map(([url]) => url).sort()).toEqual([...Object.keys(FILES), '/data/context.json'].sort())
  expect(loaded.satelliteData).toEqual({
    area: null, event: '2026-08-26', before: { date: '2026-08-24' }, after: null, validation: null, detail: null, osm_quality: null, context: null,
  })
  expect(loaded.settlements[0]).toMatchObject({ population: null, connected: null })
  expect(loaded.infrastructure).toEqual([])
})

test('picture names in satellite.json are resolved against the data folder', async () => {
  const satellite = {
    before: { date: '2026-08-16', url: 'before.png', optical_url: 'before_optical.png' },
    after: { date: '2026-08-28', url: 'https://example.org/after.png' },
  }
  vi.stubGlobal('fetch', vi.fn(async () => ({ ok: true, status: 200, json: async () => satellite })))
  const { before, after } = await DATA_PARTS.satelliteData()
  expect(before).toMatchObject({ url: '/data/before.png', optical_url: '/data/before_optical.png', date: '2026-08-16' })
  expect(after.url).toBe('https://example.org/after.png')
  expect(after.optical_url).toBeUndefined()
})

test('the road map quality and the context beside the map are passed on when the run has them', async () => {
  const quality = { buildings: 10, buildings_near_road: 0.9, near_road_m: 300, settlements: 4, settlements_without_road: 1 }
  const context = { population: { by_settlement: { s001: 120 } }, river: { ratio_on_event: 0.9 } }
  const files = { ...FILES, '/data/satellite.json': { ...FILES['/data/satellite.json'], osm_quality: quality }, '/data/context.json': context }
  vi.stubGlobal('fetch', vi.fn(async (url) => ({ ok: url in files, status: url in files ? 200 : 404, json: async () => files[url] })))
  const satellite = await DATA_PARTS.satelliteData()
  expect(satellite.osm_quality).toEqual(quality)
  expect(satellite.context).toEqual(context)
})

test('a context file that cannot be loaded never stops the page', async () => {
  vi.spyOn(console, 'warn').mockImplementation(() => {})
  vi.stubGlobal('fetch', vi.fn(async (url) => (url.endsWith('context.json')
    ? { ok: false, status: 400 }
    : { ok: true, status: 200, json: async () => FILES['/data/satellite.json'] })))
  expect((await DATA_PARTS.satelliteData()).context).toBeNull()
  // and one in the wrong shape is ignored, not trusted
  vi.stubGlobal('fetch', vi.fn(async (url) => ({ ok: true, status: 200, json: async () => (url.endsWith('context.json') ? [1, 2] : FILES['/data/satellite.json']) })))
  expect((await DATA_PARTS.satelliteData()).context).toBeNull()
})

test('a missing file is an error, not a silent fall back to demo data', async () => {
  vi.stubGlobal('fetch', vi.fn(async () => ({ ok: false, status: 404 })))
  await expect(DATA_PARTS.floodZones()).rejects.toThrow('404')
  // and it says which file
  await expect(DATA_PARTS.buildings()).rejects.toThrow('the buildings layer')
})

test('a run without infrastructure.json is "not assessed", not a failed dashboard', async () => {
  vi.spyOn(console, 'warn').mockImplementation(() => {})
  vi.stubGlobal('fetch', vi.fn(async () => ({ ok: false, status: 404 })))
  expect(await DATA_PARTS.infrastructure()).toEqual([])
})

test('but a server error on infrastructure.json is still an error', async () => {
  vi.stubGlobal('fetch', vi.fn(async () => ({ ok: false, status: 400 })))
  await expect(DATA_PARTS.infrastructure()).rejects.toThrow('400')
})

test('a layer in the wrong format is rejected with the file named', async () => {
  vi.stubGlobal('fetch', vi.fn(async () => ({ ok: true, status: 200, json: async () => ({ not: 'a layer' }) })))
  await expect(DATA_PARTS.floodZones()).rejects.toThrow(/The flood zones layer is not in the expected format/)
  await expect(DATA_PARTS.settlements()).rejects.toThrow(/The settlements list is not in the expected format/)
})

const serve = (files) =>
  vi.fn(async (url) => ({ ok: url in files, status: url in files ? 200 : 404, json: async () => files[url] }))
const resetStore = () => useDataStore.setState({ loaded: false, loading: false, error: null, stats: null, loadedParts: {} })

describe('loading the whole run', () => {
  beforeEach(resetStore)

  test('the figures are worked out once, with the data', async () => {
    vi.stubGlobal('fetch', serve(FILES))
    await loadDamageData()
    const { loaded, error, stats } = useDataStore.getState()
    expect(error).toBeNull()
    expect(loaded).toBe(true)
    expect(stats).toMatchObject({ floodedAreaKm2: 0, infrastructureAssessed: false })
  })

  test('a record the analysis cannot read fails the load with a message, and a retry can recover', async () => {
    const zone = { type: 'Feature', geometry: null, properties: { type: 'water', area_km2: 1, confidence: 0.5 } }
    // The first feature is fine (so the shape check passes); a later one has no properties.
    const damaged = { ...FILES, '/data/flood_zones.geojson': { type: 'FeatureCollection', features: [zone, { type: 'Feature', properties: null }] } }
    vi.stubGlobal('fetch', serve(damaged))
    await loadDamageData()
    expect(useDataStore.getState().loaded).toBe(false)
    expect(useDataStore.getState().error).toMatch(/could not be analysed/)

    vi.stubGlobal('fetch', serve(FILES))
    await loadDamageData()
    expect(useDataStore.getState().error).toBeNull()
    expect(useDataStore.getState().loaded).toBe(true)
  })

  test('a file with no usable content fails the load with the file named', async () => {
    // Served successfully, but the body is empty (undefined), so it is not a feature collection
    vi.stubGlobal('fetch', serve({ ...FILES, '/data/roads.geojson': undefined }))
    await loadDamageData()
    expect(useDataStore.getState().error).toMatch(/The roads layer is not in the expected format/)
  })
})
