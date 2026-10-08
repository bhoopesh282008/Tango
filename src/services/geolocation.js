// The device's position, from the browser. It needs a secure page (https or localhost) and the
// person's permission; every way it can fail is turned into a sentence they can act on.

export function explainGeolocationError(error) {
  if (!error) return 'Location is not available on this device.'
  if (error.code === 1) {
    return 'Location is blocked. Allow it for this site in the browser settings, or choose a start point on the map.'
  }
  if (error.code === 3) return 'No GPS fix yet. Move to open sky, or choose a start point on the map.'
  if (typeof window !== 'undefined' && window.isSecureContext === false) {
    return 'Location needs a secure (https) connection.'
  }
  return 'The device could not find its position. Choose a start point on the map.'
}

export const hasGeolocation = () => typeof navigator !== 'undefined' && 'geolocation' in navigator

// One reading. Resolves to { lng, lat, accuracy } or rejects with a sentence.
export function locateOnce() {
  return new Promise((resolve, reject) => {
    if (!hasGeolocation()) {
      reject(new Error(explainGeolocationError(null)))
      return
    }
    navigator.geolocation.getCurrentPosition(
      ({ coords }) => resolve({ lng: coords.longitude, lat: coords.latitude, accuracy: coords.accuracy }),
      (error) => reject(new Error(explainGeolocationError(error))),
      { enableHighAccuracy: true, maximumAge: 10_000, timeout: 15_000 },
    )
  })
}

// Keeps the screen on while navigating. Not every browser can, so a failure is ignored.
export async function holdScreenAwake() {
  try {
    const lock = await navigator.wakeLock?.request('screen')
    return () => lock?.release().catch(() => {})
  } catch {
    return () => {}
  }
}
