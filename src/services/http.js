// The one way the dashboard fetches data. Without it a stalled server leaves the splash
// screen up for ever, and one dropped packet on a mobile connection fails the whole load.
//
// Each attempt has a deadline that covers reading the body too (a 20 MB layer can stall
// half way). Network errors, timeouts and the "try again later" statuses are retried
// with a growing pause; anything else (a 404, a page that is not JSON) is final at once,
// because asking again cannot change the answer.

export class RequestError extends Error {
  constructor(message, { status = null, cause } = {}) {
    super(message)
    this.name = 'RequestError'
    this.status = status
    if (cause) this.cause = cause
  }
}

const RETRY_STATUS = new Set([408, 425, 429, 500, 502, 503, 504])
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms))

/**
 * Resolves to `read(response)` (JSON by default). Rejects with a RequestError whose message
 * says what failed in words a person can act on, e.g. "Could not load the buildings layer (HTTP 404)".
 *
 * @param {string} url
 * @param {object} [options]
 * @param {string} [options.label]   what is being loaded, for the error message
 * @param {number} [options.timeout] milliseconds allowed for one attempt, body included
 * @param {number} [options.retries] further attempts after the first
 * @param {number} [options.backoff] pause before the first retry; doubles each time
 * @param {(response: Response) => Promise<any>} [options.read]
 * @param {RequestInit} [options.init]
 */
export async function fetchData(
  url,
  { label = url, timeout = 60_000, retries = 2, backoff = 500, read = (response) => response.json(), init = {} } = {},
) {
  let failure
  for (let attempt = 0; attempt <= retries; attempt += 1) {
    const controller = new AbortController()
    const timer = setTimeout(() => controller.abort(), timeout)
    let retryable = true
    try {
      const response = await fetch(url, { ...init, signal: controller.signal })
      if (response.ok) return await read(response)
      failure = new RequestError(`Could not load ${label} (HTTP ${response.status})`, { status: response.status })
      retryable = RETRY_STATUS.has(response.status)
    } catch (error) {
      if (controller.signal.aborted) {
        failure = new RequestError(`Loading ${label} timed out after ${Math.round(timeout / 1000)} s`, { cause: error })
      } else if (error instanceof SyntaxError) {
        // A host that answers a missing file with its home page gives HTML where JSON was expected.
        failure = new RequestError(`${label} is not valid JSON; the server may have sent a web page instead`, { cause: error })
        retryable = false
      } else {
        failure = new RequestError(`Could not reach the server for ${label}. Check the connection.`, { cause: error })
      }
    } finally {
      clearTimeout(timer)
    }
    if (!retryable || attempt === retries) throw failure
    await sleep(backoff * 2 ** attempt)
  }
  throw failure
}
