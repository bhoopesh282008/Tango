import { lazy, Suspense, useEffect, useRef, useState } from 'react'

// The Earth needs the map library and a few imagery tiles, so it loads after the text is up.
const SplashGlobe = lazy(() => import('./SplashGlobe'))

// On slow or metered connections the planet is left out, so nothing delays the data.
// It also needs WebGL2, which some older devices lack.
function planetAllowed() {
  if (typeof navigator === 'undefined') return false
  const connection = navigator.connection
  if (connection?.saveData) return false
  if (['slow-2g', '2g', '3g'].includes(connection?.effectiveType)) return false
  try {
    return !!document.createElement('canvas').getContext('webgl2')
  } catch {
    return false
  }
}

// Where the planet and the satellite sit, in pixels, for a given window size.
function layout(width, height) {
  const narrow = width < 640
  const planet = narrow
    ? { x: width * 0.5, y: height * 0.82, diameter: Math.min(width * 1.05, height * 0.6) }
    : { x: width * 0.74, y: height * 0.68, diameter: Math.min(width, height) * 0.8 }
  const satellite = narrow
    ? { x: width * 0.2, y: height * 0.12, scale: 0.55 }
    : { x: width * 0.15, y: height * 0.2, scale: 1 }
  return { planet, satellite }
}

function useWindowSize() {
  const [size, setSize] = useState(() => ({ width: window.innerWidth, height: window.innerHeight }))
  useEffect(() => {
    const update = () => setSize({ width: window.innerWidth, height: window.innerHeight })
    window.addEventListener('resize', update)
    return () => window.removeEventListener('resize', update)
  }, [])
  return size
}

// Deterministic PRNG so the sky looks the same on every visit.
function mulberry32(seed) {
  let a = seed
  return () => {
    a = (a + 0x6d2b79f5) | 0
    let t = Math.imul(a ^ (a >>> 15), 1 | a)
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

// A still field of stars. Space does not need to move; the satellite and Earth do.
function Stars({ width, height }) {
  const canvasRef = useRef(null)

  useEffect(() => {
    const canvas = canvasRef.current
    const ctx = canvas?.getContext?.('2d')
    if (!ctx) return
    const ratio = Math.min(window.devicePixelRatio || 1, 2)
    canvas.width = width * ratio
    canvas.height = height * ratio
    ctx.setTransform(ratio, 0, 0, ratio, 0, 0)
    const random = mulberry32(2026)
    const count = Math.round((width * height) / 2600)
    for (let i = 0; i < count; i++) {
      const brightness = random()
      ctx.globalAlpha = 0.25 + brightness * 0.75
      ctx.fillStyle = random() < 0.12 ? '#9cc9ff' : '#ffffff'
      ctx.beginPath()
      ctx.arc(random() * width, random() * height, 0.3 + brightness * 1.1, 0, Math.PI * 2)
      ctx.fill()
    }
  }, [width, height])

  return <canvas ref={canvasRef} className="absolute inset-0 h-full w-full" />
}

// Drawn pointing right (+x); the scene rotates it to face the Earth.
function Satellite() {
  const panel = (x) => (
    <g>
      <rect x={x} y="-58" width="34" height="46" rx="2" fill="#16407a" stroke="#6fb1ff" strokeWidth="1.5" />
      <rect x={x} y="12" width="34" height="46" rx="2" fill="#16407a" stroke="#6fb1ff" strokeWidth="1.5" />
      {[-46.5, -35, -23.5, 23.5, 35, 46.5].map((y) => (
        <line key={y} x1={x} y1={y} x2={x + 34} y2={y} stroke="#6fb1ff" strokeWidth="0.8" opacity="0.7" />
      ))}
      <line x1={x + 17} y1="-58" x2={x + 17} y2="58" stroke="#6fb1ff" strokeWidth="0.8" opacity="0.7" />
    </g>
  )
  return (
    <g>
      {/* Solar wings above and below the body */}
      {panel(-17)}
      <line x1="0" y1="-12" x2="0" y2="12" stroke="#c9ced6" strokeWidth="3" />
      {/* Body, wrapped in gold foil */}
      <rect x="-20" y="-13" width="40" height="26" rx="3" fill="#d9a441" stroke="#fff1c9" strokeWidth="1.2" />
      <rect x="-14" y="-8" width="12" height="16" rx="1.5" fill="#b07f24" />
      <circle cx="9" cy="0" r="3" fill="#ff6b6b" className="splash-pulse" />
      {/* Instrument dish facing the Earth */}
      <line x1="20" y1="0" x2="30" y2="0" stroke="#c9ced6" strokeWidth="2.5" />
      <path d="M 30 -13 Q 40 0 30 13 Z" fill="#e8ecf2" stroke="#ffffff" strokeWidth="1" />
      {/* Whip antenna */}
      <line x1="-20" y1="-9" x2="-36" y2="-20" stroke="#c9ced6" strokeWidth="1.5" />
      <circle cx="-36" cy="-20" r="2" fill="#c9ced6" />
    </g>
  )
}

export default function SpaceScene() {
  const { width, height } = useWindowSize()
  const [allowed] = useState(planetAllowed)
  const [planetShown, setPlanetShown] = useState(false)
  const { planet, satellite } = layout(width, height)

  // The satellite looks at the middle of the planet, where India settles.
  const dx = planet.x - satellite.x
  const dy = planet.y - satellite.y
  const distance = Math.hypot(dx, dy)
  const angle = (Math.atan2(dy, dx) * 180) / Math.PI
  const dishOffset = 38 * satellite.scale
  const footprint = planet.diameter * 0.09

  return (
    <div className="absolute inset-0 -z-10 overflow-hidden bg-[#05050d]" aria-hidden>
      <Stars width={width} height={height} />

      {allowed && (
        <div
          className={`absolute inset-0 transition-opacity duration-1000 ${planetShown ? 'opacity-100' : 'opacity-0'}`}
        >
          <Suspense fallback={null}>
            <SplashGlobe planet={planet} onShown={() => setPlanetShown(true)} />
          </Suspense>
        </div>
      )}

      <svg className="absolute inset-0 h-full w-full" viewBox={`0 0 ${width} ${height}`}>
        <defs>
          <linearGradient id="splash-beam" x1="0" x2="1">
            <stop offset="0" stopColor="#6fb1ff" stopOpacity="0.5" />
            <stop offset="1" stopColor="#6fb1ff" stopOpacity="0.16" />
          </linearGradient>
        </defs>
        <g transform={`translate(${satellite.x} ${satellite.y}) rotate(${angle})`}>
          {/* Observation swath from the dish to the ground footprint */}
          {planetShown && (
            <g className="splash-scan">
              <polygon
                points={`${dishOffset},0 ${distance},${-footprint} ${distance},${footprint}`}
                fill="url(#splash-beam)"
              />
              <ellipse
                cx={distance}
                cy="0"
                rx={footprint * 0.6}
                ry={footprint}
                fill="none"
                stroke="#6fb1ff"
                strokeWidth="2"
                opacity="0.9"
              />
            </g>
          )}
          <g className="splash-float">
            <g transform={`scale(${satellite.scale})`}>
              <Satellite />
            </g>
          </g>
        </g>
      </svg>

      {/* Darkens the scene a little so the text keeps its contrast. */}
      <div className="absolute inset-0 bg-[rgba(5,5,13,0.38)]" />
    </div>
  )
}
