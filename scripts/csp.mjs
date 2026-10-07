// The Content-Security-Policy of the built site, put in a <meta> tag by vite.config.js.
// (GitHub Pages cannot send response headers, so a meta tag is the only way to set one.
// That also means `frame-ancestors`, which browsers ignore in a meta tag, is not set.)
//
// The point of it: if a script or a tracking pixel ever got into the page, it could not talk
// to anyone but the hosts below. Every host here is one the code really uses (see
// src/config/mapConfig.js and the splash globe); add one only when the code starts using it.

// Map tiles, vector styles and fonts, imagery, the Earth texture, elevation tiles
export const TILE_HOSTS = [
  'https://tiles.openfreemap.org',
  'https://tiles.maps.eox.at',
  'https://server.arcgisonline.com',
  'https://gibs.earthdata.nasa.gov',
  'https://s3.amazonaws.com',
]

export const contentSecurityPolicy = [
  "default-src 'self'",
  // 'wasm-unsafe-eval' lets the Draco decoder (a WebAssembly module) compile; it does not allow eval()
  "script-src 'self' 'wasm-unsafe-eval'",
  // React sets inline styles (positions, bar widths, colours taken from the data)
  "style-src 'self' 'unsafe-inline'",
  `img-src 'self' data: blob: ${TILE_HOSTS.join(' ')}`,
  `connect-src 'self' blob: ${TILE_HOSTS.join(' ')}`,
  "font-src 'self' data:",
  // MapLibre's worker is a file of our own; three.js starts its Draco workers from blob: URLs
  "worker-src 'self' blob:",
  "object-src 'none'",
  "base-uri 'self'",
  "form-action 'self'",
].join('; ')
