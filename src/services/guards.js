// A loaded file is checked for the shape the dashboard relies on before anything uses it.
// Without this a truncated or out-of-date file fails later as "Cannot read properties of
// undefined" in a component; here it fails at once and names the file.
//
// Only the top level and the first record are checked: enough to catch the wrong or an
// incomplete file, cheap enough for a layer of 85,000 buildings.

export class DataError extends Error {
  constructor(message) {
    super(message)
    this.name = 'DataError'
  }
}

const isObject = (value) => value !== null && typeof value === 'object' && !Array.isArray(value)

function reject(label, expected) {
  throw new DataError(
    `${label} is not in the expected format (${expected}). The run may be incomplete, or written by a different version of the pipeline.`,
  )
}

// A GeoJSON FeatureCollection whose features carry the named properties.
export function featureCollection(value, label, required = []) {
  if (!isObject(value) || !Array.isArray(value.features)) reject(label, 'a GeoJSON FeatureCollection')
  const first = value.features[0]
  if (first) {
    if (!isObject(first.properties)) reject(label, 'features with properties')
    const missing = required.filter((key) => !(key in first.properties))
    if (missing.length) reject(label, `features with ${missing.join(', ')}`)
  }
  return value
}

// An array of records, each carrying the named keys.
export function list(value, label, required = []) {
  if (!Array.isArray(value)) reject(label, 'a list')
  const first = value[0]
  if (first !== undefined) {
    if (!isObject(first)) reject(label, 'a list of records')
    const missing = required.filter((key) => !(key in first))
    if (missing.length) reject(label, `records with ${missing.join(', ')}`)
  }
  return value
}

// A single record (satellite.json).
export function record(value, label) {
  if (!isObject(value)) reject(label, 'an object')
  return value
}
