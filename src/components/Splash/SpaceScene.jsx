import { lazy, Suspense, useEffect, useState } from 'react'
import { asset } from '../../config/assets'
import { EARTH, formatCoordinates, locate } from './earth'

// The satellite needs a 3D library and a model, so it loads after the text is on screen.
const SatelliteModel = lazy(() => import('./SatelliteModel'))

// NASA's Tycho star map (github.com/nasa/NASA-3D-Resources): the real sky, Milky Way included.
const STAR_MAP = asset('images/starmap.webp')

// The Earth is a plain picture (see earth.js), so it is always there, on any connection and any
// graphics card. Only the 3D satellite, which is extra, can be switched off: when the browser
// reports a request to save data, or a 2G link, or has no WebGL2. A "3g" report is not a reason:
// browsers guess it from round-trip time, and it is often wrong on a perfectly good connection.
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
// the Earth if that place is on the side we see, and the radar strip is drawn across it.
// `settled` is true once the data has arrived: the satellite waits for that so it never
// competes with the data for the connection.
export default function SpaceScene({ target, settled }) {
  const { width, height } = useWindowSize()
  const [withSatellite] = useState(satelliteAllowed)
  const [satelliteShown, setSatelliteShown] = useState(false)
  const { wide, planet, orbit, satellite } = layout(width, height)

  const spot = target ? locate(target.latitude, target.longitude) : null
  const mark = spot?.visible
    ? { x: planet.left + spot.x * planet.image, y: planet.top + spot.y * planet.image }
    : null
  // Sentinel-1 climbs the sky heading a little west of north when ascending, and descends a little west of south.
  const trackAngle = target?.track?.state === 'descending' ? 12 : -12
  const swathWidth = SWATH_KM * (planet.diameter / EARTH_DIAMETER_KM)
  // The name goes where that line meets the sky: about 170 px from the top of the window
  let label = null
  if (mark) {
    const length = Math.max(0, (mark.y - 170) / Math.cos((trackAngle * Math.PI) / 180))
    label = { length, x: mark.x + length * Math.sin((trackAngle * Math.PI) / 180), y: mark.y - length }
  }

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
      </div>

      {mark && target.track && (
        // The strip is clipped to the planet, so it never spills onto the sky
        <div
          className="absolute overflow-hidden rounded-full"
          style={{ left: planet.centre.x - planet.radius, top: planet.centre.y - planet.radius, width: planet.diameter, height: planet.diameter }}
        >
          <div
            className="absolute"
            style={{
              left: mark.x - (planet.centre.x - planet.radius),
              top: mark.y - (planet.centre.y - planet.radius),
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

      {mark && (
        <>
          <span
            className="splash-mark absolute block h-[18px] w-[18px] -translate-x-1/2 -translate-y-1/2 rounded-full border-[1.5px] border-[#ff6b6b]"
            style={{ left: mark.x, top: mark.y }}
          >
            <span className="absolute left-1/2 top-1/2 h-1 w-1 -translate-x-1/2 -translate-y-1/2 rounded-full bg-[#ff6b6b]" />
          </span>
          {wide && label && (
            <div className="splash-in" style={{ '--i': 9 }}>
              {/* A hairline from the mark up the line of the track, out over the dark sky to the name:
                  the name sits on the black, where it can be read, not on the bright land. */}
              <span
                className="absolute block w-px origin-bottom bg-[rgba(242,241,237,0.5)]"
                style={{ left: mark.x, top: mark.y - label.length, height: label.length, transform: `rotate(${trackAngle}deg)` }}
              />
              <div className="absolute pl-3 text-xs leading-snug text-[#c9cbc8]" style={{ left: label.x, top: label.y - 8 }}>
                <p className="text-sm font-semibold text-[#f2f1ed]">{target.name}</p>
                <p className="num">{formatCoordinates(target.latitude, target.longitude)}</p>
                {target.track && (
                  <p>
                    Sentinel-1, track {target.track.orbit}, {target.track.state}
                  </p>
                )}
              </div>
            </div>
          )}
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
