import { ENDPOINTS, USE_MOCK } from '../config/apiConfig'
import { get, mock } from './api'

// Array of { id, name, name_np?, lat, lng, population, connected }
export async function getSettlements() {
  if (USE_MOCK) return mock((await import('../data/mockData')).settlements)
  return get(ENDPOINTS.settlements)
}
