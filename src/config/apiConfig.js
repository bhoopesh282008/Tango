export const API_BASE_URL = (import.meta.env.VITE_API_BASE_URL ?? '').replace(/\/$/, '')

// Folder of static files written by pipeline/run.py, e.g. /data
export const DATA_URL = (import.meta.env.VITE_DATA_URL ?? '').replace(/\/$/, '')

// pipeline: static files from a pipeline run. api: a REST backend.
// demo: neither is configured, so the services answer from src/data.
export const DATA_MODE = DATA_URL ? 'pipeline' : API_BASE_URL ? 'api' : 'demo'
export const USE_MOCK = DATA_MODE === 'demo'

export const PIPELINE_FILES = {
  satellite: '/satellite.json',
  floodZones: '/flood_zones.geojson',
  buildings: '/buildings.geojson',
  roads: '/roads.geojson',
  infrastructure: '/infrastructure.json',
  settlements: '/settlements.json',
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
