// The dashboard shows whichever published run is chosen, and reads that run's own files.
vi.mock('./apiConfig', async (original) => ({
  ...(await original()),
  DATA_URL: '/data',
  DATA_MODE: 'pipeline',
  USE_MOCK: false,
}))

const RUNS = [
  { id: 'kali-gandaki', name: 'Kali Gandaki, Mustang', event: '2026-09-14' },
  { id: 'trishuli-corridor', name: 'Trishuli corridor, Rasuwa, Nepal', event: '2026-08-26' },
]

const serve = (files) =>
  vi.fn(async (url) => ({ ok: url in files, status: url in files ? 200 : 404, json: async () => files[url] }))

// config/run.js keeps its choice for the life of the page, so each test loads it afresh.
async function freshModules(search = '') {
  vi.resetModules()
  window.history.replaceState(null, '', `/${search}`)
  sessionStorage.clear()
  return { run: await import('./run'), api: await import('../services/api') }
}

afterEach(() => vi.unstubAllGlobals())

test('opens the newest run and reads its files from its own folder', async () => {
  const { run, api } = await freshModules()
  const fetch = serve({ '/data/runs.json': RUNS, '/data/kali-gandaki/settlements.json': [{ id: 's1' }] })
  vi.stubGlobal('fetch', fetch)

  const loaded = await run.loadRuns()
  expect(loaded.run.id).toBe('kali-gandaki')
  expect(loaded.runs).toHaveLength(2)
  expect(run.runBase()).toBe('/data/kali-gandaki')
  expect(run.filePrefix()).toBe('kali-gandaki')
  expect(await api.getFile('/settlements.json')).toEqual([{ id: 's1' }])
})

test('the area in the address picks the run', async () => {
  const { run } = await freshModules('?area=trishuli-corridor')
  vi.stubGlobal('fetch', serve({ '/data/runs.json': RUNS }))
  expect((await run.loadRuns()).run.name).toBe('Trishuli corridor, Rasuwa, Nepal')
  expect(run.runBase()).toBe('/data/trishuli-corridor')
})

test('an unknown area falls back to the newest run', async () => {
  const { run } = await freshModules('?area=nowhere')
  vi.stubGlobal('fetch', serve({ '/data/runs.json': RUNS }))
  expect((await run.loadRuns()).run.id).toBe('kali-gandaki')
})

test('a data folder with one run and no list is read directly', async () => {
  const { run } = await freshModules()
  vi.stubGlobal('fetch', serve({}))
  expect(await run.loadRuns()).toEqual({ runs: [], run: null })
  expect(run.runBase()).toBe('/data')
})
