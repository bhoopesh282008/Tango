import { lazy, Suspense, useEffect, useLayoutEffect, useRef, useState } from 'react'
import { asset } from '../../config/assets'
import { hasWebGL } from '../../utils/webgl'
import { EARTH, formatCoordinates, locate } from './earth'
import SpinningEarth from './SpinningEarth'

// The satellite needs a 3D library and a model, so it loads after the text is on screen.
const SatelliteModel = lazy(() => import('./SatelliteModel'))

// NASA's Tycho star map (github.com/nasa/NASA-3D-Resources): the real sky, Milky Way included.
const STAR_MAP = asset('images/starmap.webp')

// The Earth is first a plain picture (see earth.js), so it is there at once, on any connection and
// any graphics card, and stays if WebGL is missing; SpinningEarth then takes over and turns it.
// Only the 3D satellite, which is extra, can be switched off: when the browser reports a request to
// save data, or a 2G link, or has no WebGL2. A "3g" report is not a reason: browsers guess it from
// round-trip time, and it is often wrong on a perfectly good connection.
export function satelliteAllowed() {
  if (typeof navigator === 'undefined') return false
  const connection = navigator.connection
  if (connection?.saveData) return false
  if (['slow-2g', '2g'].includes(connection?.effectiveType)) return false
  try {
    return !!document.createElement('canvas').getContext('webgl2')
  } catch {
    return false
  }
}

// From this width the text is a column on the left and the planet fills the right.
// Must match the `lg` breakpoint of the app (tailwind.config.js).
const SPLIT_FROM = 1025
const EARTH_DIAMETER_KM = 12742
// Sentinel-1 images a strip about 250 km wide (interferometric wide swath)
const SWATH_KM = 250
// Where the name sits: this far from the top of the window, up the line of the radar track
const LABEL_TOP = 170

// Where everything sits, in pixels, for a window of this size. The planet is larger than the
// frame and rises from its lower edge, so it reads as a horizon, not as an object in a box.
function layout(width, height) {
  const wide = width >= SPLIT_FROM
  const diameter = wide ? Math.min(height * 1.5, width * 0.9) : Math.min(width * 1.25, height * 0.72)
  const radius = diameter / 2
  const centre = { x: wide ? width * 0.74 : width * 0.62, y: (wide ? height * 0.3 : height * 0.6) + radius }
  const image = diameter / EARTH.disc

  // The satellite rides an orbit just outside the planet, up and to the left of it.
  const orbit = radius * 1.2
  const angle = ((wide ? -128 : -118) * Math.PI) / 180
  const size = wide ? Math.min(width, height) * 0.26 : Math.min(width * 0.34, 150)
  let satelliteX = centre.x + orbit * Math.cos(angle)
  if (wide) {
    // Never over the name: keep it right of where the wordmark ends (it is about 3.3 times its
    // font size wide, and starts at 6vw), and slide along the orbit to do so.
    const wordmarkEnd = width * 0.06 + 3.3 * Math.min(width * 0.11, 152) + 24
    satelliteX = Math.max(satelliteX, wordmarkEnd + size / 2)
  }
  const across = Math.min(orbit, Math.abs(satelliteX - centre.x))
  const satelliteY = Math.max(size / 2 + 16, centre.y - Math.sqrt(orbit * orbit - across * across))
  return {
    wide,
    planet: { centre, radius, diameter, image, left: centre.x - image / 2, top: centre.y - image / 2 },
    orbit,
    satellite: { x: satelliteX, y: satelliteY, size, shown: wide || width >= 640 },
  }
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

// `target` is where the run is: { latitude, longitude, name, track } or null. It is marked on
// the Earth while that place faces us, with the radar strip drawn across it, and both follow the
// Earth as it turns. `settled` is true once the data has arrived: the satellite waits for that so
// it never competes with the data for the connection.
export default function SpaceScene({ target, settled }) {
  const { width, height } = useWindowSize()
  const [withSatellite] = useState(satelliteAllowed)
  const [live] = useState(hasWebGL)
  const [satelliteShown, setSatelliteShown] = useState(false)
  const [turning, setTurning] = useState(false)
  const { wide, planet, orbit, satellite } = layout(width, height)

  // Things drawn on the Earth are moved directly on every frame: re-rendering React sixty times a second would be waste.
  const markRef = useRef(null)
  const leaderRef = useRef(null)
  const leaderLineRef = useRef(null)
  const labelRef = useRef(null)
  const stripRef = useRef(null)
  const longitude = useRef(EARTH.longitude0)
  const swathWidth = SWATH_KM * (planet.diameter / EARTH_DIAMETER_KM)
  // Sentinel-1 climbs the sky heading a little west of north when ascending, and descends a little west of south.
  const trackAngle = target?.track?.state === 'descending' ? 12 : -12

  const place = (turnedTo) => {
    longitude.current = turnedTo
    if (!target) return
    const spot = locate(target.latitude, target.longitude, { ...EARTH, longitude0: turnedTo })
    const x = planet.left + spot.x * planet.image
    const y = planet.top + spot.y * planet.image
    const opacity = spot.visible ? '1' : '0'
    const lean = (trackAngle * Math.PI) / 180
    // The name goes where the track's line meets the dark sky
    const length = Math.max(0, (y - LABEL_TOP) / Math.cos(lean))

    if (markRef.current) {
      markRef.current.style.transform = `translate(${x - 9}px, ${y - 9}px)`
      markRef.current.style.opacity = opacity
    }
    if (leaderRef.current) {
      leaderRef.current.style.transform = `translate(${x}px, ${y}px)`
      leaderRef.current.style.opacity = opacity
      if (leaderLineRef.current) leaderLineRef.current.style.height = `${length}px`
    }
    if (labelRef.current) {
      labelRef.current.style.transform = `translate(${x + length * Math.sin(lean)}px, ${y - length - 8}px)`
      labelRef.current.style.opacity = opacity
    }
    if (stripRef.current) {
      stripRef.current.style.left = `${x - (planet.centre.x - planet.radius)}px`
      stripRef.current.style.top = `${y - (planet.centre.y - planet.radius)}px`
      stripRef.current.style.opacity = opacity
    }
  }
  // After every render (a resize moves the planet) the marks are put where the Earth now is
  useLayoutEffect(() => place(longitude.current))

  return (
    <div className="absolute inset-0 -z-10 overflow-hidden bg-[#0b0c0d]" aria-hidden>
      {/* The map is dim as shipped; lift it a little so the stars read on a bright screen. */}
      <div
        className="absolute inset-0 bg-cover bg-center [filter:brightness(1.5)_contrast(1.1)]"
        style={{ backgroundImage: `url(${STAR_MAP})` }}
      />

      <svg className="absolute inset-0 h-full w-full" width={width} height={height}>
        <circle
          cx={planet.centre.x}
          cy={planet.centre.y}
          r={orbit}
          fill="none"
          stroke="rgba(242,241,237,0.45)"
          strokeWidth="1.5"
          strokeLinecap="round"
          strokeDasharray="0.1 8"
        />
      </svg>

      <div className="splash-rise absolute" style={{ left: planet.left, top: planet.top, width: planet.image, height: planet.image }}>
        <img
          src={EARTH.src}
          alt=""
          width="1800"
          height="1800"
          decoding="async"
          // lowercase: React 18 passes it through as the HTML attribute (camelCase is React 19)
          // eslint-disable-next-line react/no-unknown-property -- the rule expects React 19's spelling
          fetchpriority="high"
          className="block h-full w-full select-none"
          draggable={false}
        />
        {live && (
          <div className={`absolute inset-0 transition-opacity duration-700 ${turning ? 'opacity-100' : 'opacity-0'}`}>
            <SpinningEarth onTurn={place} onShown={() => setTurning(true)} />
          </div>
        )}
      </div>

      {target?.track && (
        // The strip is clipped to the planet, so it never spills onto the sky
        <div
          className="absolute overflow-hidden rounded-full"
          style={{ left: planet.centre.x - planet.radius, top: planet.centre.y - planet.radius, width: planet.diameter, height: planet.diameter }}
        >
          <div
            ref={stripRef}
            className="absolute opacity-0 transition-opacity duration-500"
            style={{
              width: swathWidth,
              height: planet.diameter * 1.4,
              transform: `translate(-50%, -50%) rotate(${trackAngle}deg)`,
              background:
                'linear-gradient(90deg, rgba(242,241,237,0.55) 0 1px, rgba(242,241,237,0.08) 1px calc(100% - 1px), rgba(242,241,237,0.55) calc(100% - 1px))',
              maskImage: 'linear-gradient(to bottom, transparent, #000 30%, #000 70%, transparent)',
              WebkitMaskImage: 'linear-gradient(to bottom, transparent, #000 30%, #000 70%, transparent)',
            }}
          />
        </div>
      )}

      {target && (
        <div ref={markRef} className="absolute left-0 top-0 opacity-0 transition-opacity duration-500">
          <span className="splash-mark relative block h-[18px] w-[18px] rounded-full border-[1.5px] border-[#ff6b6b]">
            <span className="absolute left-1/2 top-1/2 h-1 w-1 -translate-x-1/2 -translate-y-1/2 rounded-full bg-[#ff6b6b]" />
          </span>
        </div>
      )}

      {target && wide && (
        <>
          {/* A hairline from the mark up the line of the track, out over the dark sky to the name:
              the name sits on the black, where it can be read, not on the bright land. */}
          <div ref={leaderRef} className="absolute left-0 top-0 opacity-0 transition-opacity duration-500">
            <div className="splash-in" style={{ '--i': 9 }}>
              <span
                ref={leaderLineRef}
                className="absolute bottom-0 left-0 block w-px origin-bottom bg-[rgba(242,241,237,0.5)]"
                style={{ transform: `rotate(${trackAngle}deg)` }}
              />
            </div>
          </div>
          <div ref={labelRef} className="absolute left-0 top-0 opacity-0 transition-opacity duration-500">
            <div className="splash-in pl-3 text-xs leading-snug text-[#c9cbc8]" style={{ '--i': 9 }}>
              <p className="text-sm font-semibold text-[#f2f1ed]">{target.name}</p>
              <p className="num">{formatCoordinates(target.latitude, target.longitude)}</p>
              {target.track && (
                <p>
                  Sentinel-1, track {target.track.orbit}, {target.track.state}
                </p>
              )}
            </div>
          </div>
        </>
      )}

      {withSatellite && settled && satellite.shown && (
        <div
          className={`splash-float absolute transition-opacity duration-1000 ${satelliteShown ? 'opacity-100' : 'opacity-0'}`}
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
      )}

      {/* A little darker on the text side, so the words keep their contrast over the stars */}
      <div className="absolute inset-0 bg-[linear-gradient(90deg,rgba(11,12,13,0.55),rgba(11,12,13,0)_55%)]" />
    </div>
  )
}
