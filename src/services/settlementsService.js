import { DATA_MODE, ENDPOINTS, PIPELINE_FILES, USE_MOCK } from '../config/apiConfig'
import { get, getFile, mock } from './api'
import { list } from './guards'

// Array of { id, name, name_np?, lat, lng, population, connected }.
// From a pipeline run, population may be null (not in OSM) and connected may be
// null (no road to the settlement in the pre-event map, so access is unknown).
export async function getSettlements() {
  if (USE_MOCK) return mock((await import('../data/mockData')).settlements)
  const settlements = DATA_MODE === 'pipeline' ? await getFile(PIPELINE_FILES.settlements) : await get(ENDPOINTS.settlements)
  return list(settlements, 'The settlements list', ['id', 'name'])
}
