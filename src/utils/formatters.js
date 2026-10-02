export function formatNumber(value, digits = 0) {
  return Number(value).toLocaleString('en-US', {
    minimumFractionDigits: digits,
    maximumFractionDigits: digits,
  })
}

export function formatDate(iso) {
  return new Date(`${iso}T00:00:00Z`).toLocaleDateString('en-GB', {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
    timeZone: 'UTC',
  })
}

export function formatPercent(fraction) {
  return `${Math.round(fraction * 100)}%`
}

export function formatDistance(km) {
  return km < 1 ? `${Math.round(km * 1000)} m` : `${km.toFixed(2)} km`
}

export function formatArea(km2) {
  if (km2 < 0.01) return `${formatNumber(km2 * 1e6)} m²`
  return `${km2.toFixed(2)} km² (${formatNumber(km2 * 100, 1)} ha)`
}

export function formatLatLng({ lat, lng }) {
  return `${lat.toFixed(5)}, ${lng.toFixed(5)}`
}
