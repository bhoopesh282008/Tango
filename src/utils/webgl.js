let supported

// Whether this browser can draw a map. Checked once: creating a context is not free, and
// without it MapLibre fails inside its own setup, where nothing in the page can catch it.
export function hasWebGL() {
  if (supported === undefined) {
    try {
      // jsdom, and browsers with WebGL removed, have no such interface.
      supported =
        typeof WebGLRenderingContext !== 'undefined' &&
        !!(document.createElement('canvas').getContext('webgl2') || document.createElement('canvas').getContext('webgl'))
    } catch {
      supported = false
    }
  }
  return supported
}
