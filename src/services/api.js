import { API_BASE_URL } from '../config/apiConfig'
import { runBase } from '../config/run'
import { fetchData } from './http'

// What each pipeline file is called when loading it fails
const NAMES = {
  '/satellite.json': 'the satellite scene record',
  '/flood_zones.geojson': 'the flood zones layer',
  '/buildings.geojson': 'the buildings layer',
  '/roads.geojson': 'the roads layer',
  '/infrastructure.json': 'the infrastructure layer',
  '/settlements.json': 'the settlements list',
}

function request(path, { params, base = API_BASE_URL, ...init } = {}) {
  const query = params ? `?${new URLSearchParams(params)}` : ''
  return fetchData(`${base}${path}${query}`, { label: NAMES[path] ?? path, init })
}

export const get = (path, params) => request(path, { params })

// A file from a pipeline run. With `optional`, a file the run does not have (HTTP 404)
// gives null instead of an error; any other failure is still an error.
export async function getFile(path, { optional = false } = {}) {
  try {
    return await request(path, { base: runBase() })
  } catch (error) {
    if (optional && error.status === 404) return null
    throw error
  }
}

export const post = (path, body) =>
  request(path, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  })

// Resolves demo data after a short delay so loading states are exercised.
export const mock = (value, ms = 250) =>
  new Promise((resolve) => setTimeout(() => resolve(value), ms))
