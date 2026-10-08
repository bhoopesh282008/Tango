export function formatNumber(value, digits = 0) {
  return Number(value).toLocaleString('en-US', {
    minimumFractionDigits: digits,
    maximumFractionDigits: digits,
  })
}

// A head count, or a plain statement that the source has none.
export function formatPeople(value, missing = 'population not recorded') {
  return value == null ? missing : `${formatNumber(value)} people`
}

export function formatDate(iso) {
  if (!iso) return 'date not recorded'
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

// Route distances: metres up to a kilometre, then kilometres with as many decimals as help.
export function formatMetres(m) {
  if (m < 1000) return `${Math.round(m / 10) * 10 || Math.round(m)} m`
  return `${(m / 1000).toFixed(m < 10000 ? 2 : 1)} km`
}

export function formatDuration(minutes) {
  const total = Math.max(1, Math.round(minutes))
  if (total < 60) return `${total} min`
  const hours = Math.floor(total / 60)
  const rest = total % 60
  return rest === 0 ? `${hours} h` : `${hours} h ${rest} min`
}

export function formatArea(km2) {
  if (km2 < 0.01) return `${formatNumber(km2 * 1e6)} m²`
  return `${km2.toFixed(2)} km² (${formatNumber(km2 * 100, 1)} ha)`
}

export function formatLatLng({ lat, lng }) {
  return `${lat.toFixed(5)}, ${lng.toFixed(5)}`
}
