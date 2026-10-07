import { fetchData, RequestError } from './http'

const reply = (status, body) => ({ ok: status >= 200 && status < 300, status, json: async () => body })

beforeEach(() => vi.useFakeTimers())
afterEach(() => {
  vi.useRealTimers()
  vi.unstubAllGlobals()
})

// Rejection is awaited alongside the clock so the retry pauses can run.
async function settle(promise) {
  const outcome = promise.then(
    (value) => ({ value }),
    (error) => ({ error }),
  )
  await vi.runAllTimersAsync()
  return outcome
}

test('returns the parsed body', async () => {
  vi.stubGlobal('fetch', vi.fn(async () => reply(200, { ok: 1 })))
  expect(await fetchData('/x.json')).toEqual({ ok: 1 })
})

test('retries a server error and then succeeds', async () => {
  const fetch = vi
    .fn()
    .mockResolvedValueOnce(reply(503))
    .mockResolvedValueOnce(reply(502))
    .mockResolvedValueOnce(reply(200, [1]))
  vi.stubGlobal('fetch', fetch)
  const { value } = await settle(fetchData('/x.json'))
  expect(value).toEqual([1])
  expect(fetch).toHaveBeenCalledTimes(3)
})

test('does not retry a 404, and the message names the file and the status', async () => {
  const fetch = vi.fn(async () => reply(404))
  vi.stubGlobal('fetch', fetch)
  const { error } = await settle(fetchData('/data/buildings.geojson', { label: 'the buildings layer' }))
  expect(error).toBeInstanceOf(RequestError)
  expect(error.message).toBe('Could not load the buildings layer (HTTP 404)')
  expect(error.status).toBe(404)
  expect(fetch).toHaveBeenCalledTimes(1)
})

test('gives up after the retries are used and says so', async () => {
  const fetch = vi.fn(async () => reply(500))
  vi.stubGlobal('fetch', fetch)
  const { error } = await settle(fetchData('/x.json', { retries: 2 }))
  expect(error.status).toBe(500)
  expect(fetch).toHaveBeenCalledTimes(3)
})

test('a network failure is retried and reported as one', async () => {
  const fetch = vi.fn(async () => {
    throw new TypeError('Failed to fetch')
  })
  vi.stubGlobal('fetch', fetch)
  const { error } = await settle(fetchData('/x.json', { label: 'the roads layer', retries: 1 }))
  expect(error.message).toMatch(/Could not reach the server for the roads layer/)
  expect(fetch).toHaveBeenCalledTimes(2)
})

test('a request that never answers is cut off at the deadline', async () => {
  // Rejects when aborted, as the real fetch does
  const fetch = vi.fn(
    (url, { signal }) =>
      new Promise((resolve, reject) => {
        signal.addEventListener('abort', () => reject(new DOMException('Aborted', 'AbortError')))
      }),
  )
  vi.stubGlobal('fetch', fetch)
  const { error } = await settle(fetchData('/x.json', { label: 'the roads layer', timeout: 5000, retries: 0 }))
  expect(error.message).toBe('Loading the roads layer timed out after 5 s')
})

test('a page where JSON was expected is final, not retried', async () => {
  const fetch = vi.fn(async () => ({
    ok: true,
    status: 200,
    json: async () => {
      throw new SyntaxError('Unexpected token <')
    },
  }))
  vi.stubGlobal('fetch', fetch)
  const { error } = await settle(fetchData('/x.json', { label: 'the settlements list' }))
  expect(error.message).toMatch(/the settlements list is not valid JSON/)
  expect(fetch).toHaveBeenCalledTimes(1)
})
