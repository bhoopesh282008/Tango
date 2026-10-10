export const API_BASE_URL = (import.meta.env.VITE_API_BASE_URL ?? '').replace(/\/$/, '')

// Folder of static files written by pipeline/run.py, e.g. /data
const REAL_DATA_URL = (import.meta.env.VITE_DATA_URL ?? '').replace(/\/$/, '')

// Where the choice made with the switch in the header is kept. It only matters when this build
// has run data to show (REAL_DATA_URL): without any, there is nothing to switch to.
export const SOURCE_KEY = 'tango-data-source'
function chosenSource() {
  try {
    return localStorage.getItem(SOURCE_KEY)
  } catch {
    return null // storage blocked: the build's own default stands
  }
}
export const CAN_SWITCH_SOURCE = REAL_DATA_URL !== ''
const DEMO_CHOSEN = CAN_SWITCH_SOURCE && chosenSource() === 'demo'
export const DATA_SOURCE = DEMO_CHOSEN ? 'demo' : 'real'
export const DATA_URL = DEMO_CHOSEN ? '' : REAL_DATA_URL

// pipeline: static files from a pipeline run. api: a REST backend.
// demo: neither is configured (or the demo was chosen), so the services answer from src/data.
export const DATA_MODE = DEMO_CHOSEN ? 'demo' : DATA_URL ? 'pipeline' : API_BASE_URL ? 'api' : 'demo'
export const USE_MOCK = DATA_MODE === 'demo'

export const PIPELINE_FILES = {
  satellite: '/satellite.json',
  floodZones: '/flood_zones.geojson',
  buildings: '/buildings.geojson',
  roads: '/roads.geojson',
  infrastructure: '/infrastructure.json',
  settlements: '/settlements.json',
  // Optional: modelled population and river flow shown beside the map, never part of it
  context: '/context.json',
  // Optional: the flood zones as outlines in the pixels of the before/after pictures
  outlines: '/outlines.json',
}

export const ENDPOINTS = {
  satelliteBefore: '/satellite/before',
  satelliteAfter: '/satellite/after',
  damageAnalysis: '/damage-analysis',
  infrastructure: '/infrastructure',
  settlements: '/settlements',
  buildings: '/buildings',
  roads: '/roads',
  copilotAsk: '/copilot/ask',
}
