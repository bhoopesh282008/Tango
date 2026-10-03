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
  expect(loaded.satelliteData).toEqual({ before: { date: '2026-08-24' }, after: null })
  expect(loaded.settlements[0]).toMatchObject({ population: null, connected: null })
  expect(loaded.infrastructure).toEqual([])
})

test('a missing file is an error, not a silent fall back to demo data', async () => {
  vi.stubGlobal('fetch', vi.fn(async () => ({ ok: false, status: 404 })))
  await expect(DATA_PARTS.floodZones()).rejects.toThrow('404')
})
