// Which pipeline run the dashboard is showing.
//
// `pipeline/publish.py` puts each run in its own folder under the data folder
// and lists them, newest first, in runs.json. The run on screen is chosen by
// the `area` query parameter, then by this browser session's last choice, then
// the newest. A data folder holding a single run and no list still works: its
// files are read from the folder itself.
import { fetchData } from '../services/http'
import { DATA_MODE, DATA_URL } from './apiConfig'

const CHOICE_KEY = 'tango-area'

let runs = []
let current = null
let listRequest = null

export const getRuns = () => runs
export const getRun = () => current

// Where the current run's files are
export const runBase = () => (current ? `${DATA_URL}/${current.id}` : DATA_URL)

// Short name for exported files
export const filePrefix = () => current?.id ?? 'trishuli'

function remembered() {
  try {
    return sessionStorage.getItem(CHOICE_KEY)
  } catch {
    return null
  }
}

// Reads the list of runs once. Resolves to { runs, run }; both empty when there is no list.
export function loadRuns() {
  if (DATA_MODE !== 'pipeline') return Promise.resolve({ runs, run: current })
  listRequest ??= (async () => {
    try {
      const list = await fetchData(`${DATA_URL}/runs.json`, { label: 'the list of runs', timeout: 15_000, retries: 1 })
      if (Array.isArray(list) && list.length) {
        const wanted = new URLSearchParams(window.location.search).get('area') ?? remembered()
        runs = list
        current = list.find((run) => run.id === wanted) ?? list[0]
      }
    } catch {
      // No list, not JSON, or the server could not be reached: a folder with a single run.
    }
    return { runs, run: current }
  })()
  return listRequest
}

// Switching area reloads the page, so no figure, map view or answer from the
// previous area can stay on screen.
export function openRun(id) {
  try {
    sessionStorage.setItem(CHOICE_KEY, id)
  } catch {
    // Storage unavailable: the query parameter below still carries the choice.
  }
  const url = new URL(window.location.href)
  url.searchParams.set('area', id)
  window.location.assign(url)
}
