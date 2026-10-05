import { DATA_MODE, DATA_URL, ENDPOINTS, PIPELINE_FILES, USE_MOCK } from '../config/apiConfig'
import { EVENT_BBOX } from '../config/mapConfig'
import { EVENT } from '../utils/constants'
import { get, getFile, mock } from './api'

const PIPELINE = DATA_MODE === 'pipeline'

const bbox = { bbox: EVENT_BBOX.join(',') }
const demo = () => import('../data/mockData')

// A run names its pictures relative to its own folder.
const inDataFolder = (url) => (url && !/^(https?:)?\//.test(url) ? `${DATA_URL}/${url}` : url)
function sceneWithUrls(scene) {
  if (!scene) return null
  return {
    ...scene,
    url: inDataFolder(scene.url),
    optical_url: inDataFolder(scene.optical_url),
    detail_url: inDataFolder(scene.detail_url),
  }
}

export async function getSatellite() {
  if (USE_MOCK) return mock((await demo()).satellite)
  if (PIPELINE) {
    // A run from existing rasters records no scenes, so either side may be missing.
    const { before, after, validation, detail } = await getFile(PIPELINE_FILES.satellite)
    return {
      before: sceneWithUrls(before),
      after: sceneWithUrls(after),
      validation: validation ?? null,
      // Where the close-up pictures are, when the run made them
      detail: detail ?? null,
    }
  }
  const [before, after] = await Promise.all([
    get(ENDPOINTS.satelliteBefore, { date: EVENT.beforeDate }),
    get(ENDPOINTS.satelliteAfter, { date: EVENT.afterDate }),
  ])
  return { before, after }
}

// FeatureCollection of polygons with { id, name, type, confidence, area_km2 }
export async function getFloodZones() {
  if (USE_MOCK) return mock((await demo()).floodZones)
  if (PIPELINE) return getFile(PIPELINE_FILES.floodZones)
  return (await get(ENDPOINTS.damageAnalysis, bbox)).geojson
}

// FeatureCollection of footprints with { settlement_id, damaged }
export async function getBuildings() {
  if (USE_MOCK) return mock((await demo()).buildings)
  if (PIPELINE) return getFile(PIPELINE_FILES.buildings)
  return get(ENDPOINTS.buildings, bbox)
}

// FeatureCollection of lines with { name, damaged, length_km }
export async function getRoads() {
  if (USE_MOCK) return mock((await demo()).roads)
  if (PIPELINE) return getFile(PIPELINE_FILES.roads)
  return get(ENDPOINTS.roads, bbox)
}

// Array of { id, type, name, lat, lng, status, length_km? }
export async function getInfrastructure() {
  if (USE_MOCK) return mock((await demo()).infrastructure)
  if (PIPELINE) return getFile(PIPELINE_FILES.infrastructure)
  return get(ENDPOINTS.infrastructure)
}
