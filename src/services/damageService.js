import { DATA_MODE, ENDPOINTS, PIPELINE_FILES, USE_MOCK } from '../config/apiConfig'
import { runBase } from '../config/run'
import { EVENT_BBOX } from '../config/mapConfig'
import { EVENT } from '../utils/constants'
import { get, getFile, mock } from './api'
import { featureCollection, list, record } from './guards'

const PIPELINE = DATA_MODE === 'pipeline'

const bbox = { bbox: EVENT_BBOX.join(',') }
const demo = () => import('../data/mockData')

// A run names its pictures relative to its own folder.
const inDataFolder = (url) => (url && !/^(https?:)?\//.test(url) ? `${runBase()}/${url}` : url)
function sceneWithUrls(scene) {
  if (!scene) return null
  return {
    ...scene,
    url: inDataFolder(scene.url),
    optical_url: inDataFolder(scene.optical_url),
    detail_url: inDataFolder(scene.detail_url),
  }
}

// Modelled population and river flow from open datasets, shown beside the map and used by nothing
// in it. A run without the file has none, and a failure to load it is never worth failing the page.
async function getContext() {
  try {
    const context = await getFile(PIPELINE_FILES.context, { optional: true })
    return context && typeof context === 'object' && !Array.isArray(context) ? context : null
  } catch (error) {
    console.warn(`The context file could not be loaded (${error.message}); the page is shown without it.`)
    return null
  }
}

// One picture's outlines: { width, height, paths: { water, debris, uncertain: SVG path data } }
function outlineView(view) {
  const ok =
    view &&
    Number.isFinite(view.width) &&
    Number.isFinite(view.height) &&
    view.width > 0 &&
    view.height > 0 &&
    view.paths &&
    typeof view.paths === 'object'
  if (!ok) return null
  const paths = Object.fromEntries(
    Object.entries(view.paths).filter(([, d]) => typeof d === 'string' && d.length > 0),
  )
  return Object.keys(paths).length ? { width: view.width, height: view.height, paths } : null
}

// The flood zones drawn over the before/after pictures. Optional like the context, and for the same
// reason: a picture without outlines is still the picture, so a bad file is not worth a failed page.
async function getOutlines() {
  try {
    const file = await getFile(PIPELINE_FILES.outlines, { optional: true })
    if (!file || typeof file !== 'object') return null
    const outlines = { whole: outlineView(file.whole), detail: outlineView(file.detail) }
    return outlines.whole || outlines.detail ? outlines : null
  } catch (error) {
    console.warn(`The outlines file could not be loaded (${error.message}); the pictures are shown without them.`)
    return null
  }
}

export async function getSatellite() {
  if (USE_MOCK) return mock((await demo()).satellite)
  if (PIPELINE) {
    // A run from existing rasters records no scenes, so either side may be missing.
    const { before, after, validation, detail, area, event, osm_quality: osmQuality, null_test: nullTest } = record(
      await getFile(PIPELINE_FILES.satellite),
      'The satellite scene record',
    )
    return {
      // The flood date the run was asked about
      event: event ?? null,
      // What the run calls its area, and its bounding box [west, south, east, north]
      area: area ?? null,
      before: sceneWithUrls(before),
      after: sceneWithUrls(after),
      validation: validation ?? null,
      // Where the close-up pictures are, when the run made them
      detail: detail ?? null,
      // How complete the pre-event road map is here, when the run measured it
      osm_quality: osmQuality ?? null,
      // What the same rule marks between two images from before the flood, when that was measured
      null_test: nullTest ?? null,
      context: await getContext(),
      outlines: await getOutlines(),
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
  const zones = PIPELINE ? await getFile(PIPELINE_FILES.floodZones) : (await get(ENDPOINTS.damageAnalysis, bbox)).geojson
  return featureCollection(zones, 'The flood zones layer', ['type', 'area_km2', 'confidence'])
}

// FeatureCollection of footprints with { settlement_id, damaged }
export async function getBuildings() {
  if (USE_MOCK) return mock((await demo()).buildings)
  const buildings = PIPELINE ? await getFile(PIPELINE_FILES.buildings) : await get(ENDPOINTS.buildings, bbox)
  return featureCollection(buildings, 'The buildings layer', ['settlement_id', 'damaged'])
}

// FeatureCollection of lines with { name, damaged, length_km }
export async function getRoads() {
  if (USE_MOCK) return mock((await demo()).roads)
  const roads = PIPELINE ? await getFile(PIPELINE_FILES.roads) : await get(ENDPOINTS.roads, bbox)
  return featureCollection(roads, 'The roads layer', ['damaged', 'length_km'])
}

// Array of { id, type, name, lat, lng, status, length_km? }
// Optional: a run without the file simply did not assess infrastructure. The dashboard then says
// so ("not assessed") instead of showing zeros that would read as "none damaged".
export async function getInfrastructure() {
  if (USE_MOCK) return mock((await demo()).infrastructure)
  const infrastructure = PIPELINE ? await getFile(PIPELINE_FILES.infrastructure, { optional: true }) : await get(ENDPOINTS.infrastructure)
  if (infrastructure === null) {
    console.warn('This run has no infrastructure.json; bridges, health posts and power lines are shown as not assessed.')
    return []
  }
  return list(infrastructure, 'The infrastructure layer', ['type', 'status'])
}
