// With VITE_DATA_URL set, every dataset is read from the pipeline's static files.
vi.mock('../config/apiConfig', async (original) => ({
  ...(await original()),
  DATA_URL: '/data',
  DATA_MODE: 'pipeline',
  USE_MOCK: false,
}))

import { DATA_PARTS } from '../hooks/useDamageData'

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

  expect(fetch.mock.calls.map(([url]) => url).sort()).toEqual(Object.keys(FILES).sort())
  expect(loaded.satelliteData).toEqual({ before: { date: '2026-08-24' }, after: null, validation: null, detail: null })
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

test('a missing file is an error, not a silent fall back to demo data', async () => {
  vi.stubGlobal('fetch', vi.fn(async () => ({ ok: false, status: 404 })))
  await expect(DATA_PARTS.floodZones()).rejects.toThrow('404')
})
