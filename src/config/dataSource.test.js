// The data mode is decided when apiConfig is loaded, so each case loads it afresh.
const load = async ({ env = '/data', stored = null } = {}) => {
  vi.resetModules()
  vi.stubEnv('VITE_DATA_URL', env)
  vi.stubEnv('VITE_API_BASE_URL', '')
  localStorage.clear()
  if (stored) localStorage.setItem('tango-data-source', stored)
  return import('./apiConfig')
}

afterEach(() => {
  vi.unstubAllEnvs()
  vi.restoreAllMocks()
  localStorage.clear()
})

test('a build with run data shows it, and offers the switch', async () => {
  const config = await load()
  expect(config.DATA_MODE).toBe('pipeline')
  expect(config.DATA_URL).toBe('/data')
  expect(config.DATA_SOURCE).toBe('real')
  expect(config.CAN_SWITCH_SOURCE).toBe(true)
  expect(config.USE_MOCK).toBe(false)
})

test('choosing the demo gives the bundled dataset and no data folder', async () => {
  const config = await load({ stored: 'demo' })
  expect(config.DATA_MODE).toBe('demo')
  expect(config.USE_MOCK).toBe(true)
  expect(config.DATA_URL).toBe('')
  expect(config.DATA_SOURCE).toBe('demo')
  expect(config.CAN_SWITCH_SOURCE).toBe(true) // so it can be switched back
})

test('a build with no run data is the demo, with nothing to switch to, whatever was stored', async () => {
  const config = await load({ env: '', stored: 'demo' })
  expect(config.DATA_MODE).toBe('demo')
  expect(config.CAN_SWITCH_SOURCE).toBe(false)
})

test('an unreadable choice leaves the build default', async () => {
  vi.resetModules()
  vi.stubEnv('VITE_DATA_URL', '/data')
  vi.spyOn(Storage.prototype, 'getItem').mockImplementation(() => {
    throw new Error('blocked')
  })
  const config = await import('./apiConfig')
  expect(config.DATA_MODE).toBe('pipeline')
})

describe('setDataSource', () => {
  const reload = vi.fn()
  beforeEach(() => {
    reload.mockClear()
    Object.defineProperty(window, 'location', { value: { ...window.location, reload }, writable: true })
  })

  test('remembers the demo and loads the page again; the run data is the absence of the choice', async () => {
    const { setDataSource } = await import('./dataSource')
    expect(setDataSource('demo')).toBe(true)
    expect(localStorage.getItem('tango-data-source')).toBe('demo')
    expect(reload).toHaveBeenCalledTimes(1)
    setDataSource('real')
    expect(localStorage.getItem('tango-data-source')).toBeNull()
    expect(reload).toHaveBeenCalledTimes(2)
  })

  test('if the choice cannot be kept it does not reload into a page that would forget it', async () => {
    const { setDataSource } = await import('./dataSource')
    vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
      throw new Error('blocked')
    })
    expect(setDataSource('demo')).toBe(false)
    expect(reload).not.toHaveBeenCalled()
  })
})
