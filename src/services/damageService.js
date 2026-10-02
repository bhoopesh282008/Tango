import { ENDPOINTS, USE_MOCK } from '../config/apiConfig'
import { EVENT_BBOX } from '../config/mapConfig'
import { EVENT } from '../utils/constants'
import { get, mock } from './api'

const bbox = { bbox: EVENT_BBOX.join(',') }
const demo = () => import('../data/mockData')

export async function getSatellite() {
  if (USE_MOCK) return mock((await demo()).satellite)
  const [before, after] = await Promise.all([
    get(ENDPOINTS.satelliteBefore, { date: EVENT.beforeDate }),
    get(ENDPOINTS.satelliteAfter, { date: EVENT.afterDate }),
  ])
  return { before, after }
}

// FeatureCollection of polygons with { id, name, type, confidence, area_km2 }
export async function getFloodZones() {
  if (USE_MOCK) return mock((await demo()).floodZones)
  return (await get(ENDPOINTS.damageAnalysis, bbox)).geojson
}

// FeatureCollection of footprints with { settlement_id, damaged }
export async function getBuildings() {
  if (USE_MOCK) return mock((await demo()).buildings)
  return get(ENDPOINTS.buildings, bbox)
}

// FeatureCollection of lines with { name, damaged, length_km }
export async function getRoads() {
  if (USE_MOCK) return mock((await demo()).roads)
  return get(ENDPOINTS.roads, bbox)
}

// Array of { id, type, name, lat, lng, status, length_km? }
export async function getInfrastructure() {
  if (USE_MOCK) return mock((await demo()).infrastructure)
  return get(ENDPOINTS.infrastructure)
}
