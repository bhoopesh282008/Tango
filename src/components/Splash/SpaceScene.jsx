import { lazy, Suspense, useEffect, useState } from 'react'

// The Earth and the satellite each need a 3D library and their own assets,
// so they load after the splash text is on screen.
const SplashGlobe = lazy(() => import('./SplashGlobe'))
const SatelliteModel = lazy(() => import('./SatelliteModel'))

// NASA's Tycho star map (github.com/nasa/NASA-3D-Resources): the real sky, Milky Way included.
const STAR_MAP = '/images/starmap.webp'

// On slow or metered connections only the star map is shown, so nothing delays the data.
// The 3D parts also need WebGL2, which some older devices lack.
function sceneAllowed() {
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
    ? { x: width * 0.3, y: height * 0.11, size: 170 }
    : { x: width * 0.17, y: height * 0.24, size: Math.min(width, height) * 0.46 }
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
