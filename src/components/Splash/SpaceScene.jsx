import { lazy, Suspense, useEffect, useState } from 'react'
import { asset } from '../../config/assets'

// The Earth and the satellite each need a 3D library and their own assets,
// so they load after the splash text is on screen.
const SplashGlobe = lazy(() => import('./SplashGlobe'))
const SatelliteModel = lazy(() => import('./SatelliteModel'))

// NASA's Tycho star map (github.com/nasa/NASA-3D-Resources): the real sky, Milky Way included.
const STAR_MAP = asset('images/starmap.webp')

// On slow or metered connections only the star map is shown, so nothing delays the data.
// The 3D parts also need WebGL2, which some older devices lack.
export function sceneAllowed() {
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

// From this width the text sits in a column on the left and the scene takes the right.
// Must match the `lg` breakpoint used by SplashScreen.
const SPLIT_FROM = 1025
// Right edge of that text column: its left padding (6vw) plus its width (max-w-sm, max-w-md from xl).
const textColumnEnd = (width) => width * 0.06 + (width < 1280 ? 384 : 448)

// Where the planet and the satellite sit, in pixels, for a given window size.
function layout(width, height) {
  const narrow = width < 640
  const split = width >= SPLIT_FROM
  // Both are kept wholly inside the frame, with a margin.
  let planet
  if (narrow) {
    // Low and small enough that the button above it stays on the sky, not on the Earth.
    const diameter = Math.min(width * 0.92, height * 0.36)
    planet = { x: width * 0.5, y: height - diameter / 2 - 12, diameter }
  } else {
    // No wider than about half the window, so there is room to sit it to the right.
    const diameter = Math.min(Math.min(width, height) * 0.72, width * 0.52)
    // Right of centre, pulled in on narrower windows so the edge is not cut off.
    planet = { x: Math.min(width * 0.82, width - diameter / 2 - 16), y: height * 0.57, diameter }
  }

  if (split) {
    // Above the Earth's upper-left limb, clear of the text column.
    const size = Math.min(width, height) * 0.26
    const satellite = {
      x: Math.max(planet.x - planet.diameter * 0.5, textColumnEnd(width) + size / 2 + 24),
      y: Math.max(size / 2 + 16, planet.y - planet.diameter * 0.62),
      size,
    }
    return { planet, satellite }
  }

  const size = narrow ? 150 : Math.min(width, height) * 0.34
  // Upper left, but never so far right that a wing runs under the centred title.
  const beforeTitle = width / 2 - 150 - size / 2
  const satellite = narrow
    ? { x: size / 2 + 12, y: height * 0.1, size }
    : { x: Math.max(size / 2 + 24, Math.min(width * 0.2, beforeTitle)), y: height * 0.2, size }
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

const fade = (shown) => `transition-opacity duration-1000 ${shown ? 'opacity-100' : 'opacity-0'}`

export default function SpaceScene() {
  const { width, height } = useWindowSize()
  const [allowed] = useState(sceneAllowed)
  const [planetShown, setPlanetShown] = useState(false)
  const [satelliteShown, setSatelliteShown] = useState(false)
  const { planet, satellite } = layout(width, height)

  return (
    <div className="absolute inset-0 -z-10 overflow-hidden bg-[#03030a]" aria-hidden>
      {/* The map is dim as shipped; lift it so the stars read on a bright screen. */}
      <div
        className="absolute inset-0 bg-cover bg-center [filter:brightness(1.9)_contrast(1.15)]"
        style={{ backgroundImage: `url(${STAR_MAP})` }}
      />

      {allowed && (
        <>
          <div className={`absolute inset-0 ${fade(planetShown)}`}>
            <Suspense fallback={null}>
              <SplashGlobe planet={planet} onShown={() => setPlanetShown(true)} />
            </Suspense>
          </div>

          <div
            className={`splash-float absolute ${fade(satelliteShown)}`}
            style={{
              left: satellite.x - satellite.size / 2,
              top: satellite.y - satellite.size / 2,
              width: satellite.size,
              height: satellite.size,
            }}
          >
            <Suspense fallback={null}>
              <SatelliteModel onShown={() => setSatelliteShown(true)} />
            </Suspense>
          </div>
        </>
      )}

      {/* Darkens the scene a little so the text keeps its contrast. */}
      <div className="absolute inset-0 bg-[rgba(3,3,10,0.28)]" />
    </div>
  )
}
