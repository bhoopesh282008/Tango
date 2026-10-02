import 'maplibre-gl/dist/maplibre-gl.css'
import '../../config/maplibreWorker'
import { useEffect, useRef } from 'react'
import Map from 'react-map-gl/maplibre'

// Earth as seen from orbit: NASA Blue Marble imagery on a globe.
// There is no background layer, so the canvas stays transparent around the planet
// and the stars behind it show through.
const GLOBE_STYLE = {
  version: 8,
  projection: { type: 'globe' },
  sources: {
    earth: {
      type: 'raster',
      tiles: [
        'https://gibs.earthdata.nasa.gov/wmts/epsg3857/best/BlueMarble_ShadedRelief_Bathymetry/default/GoogleMapsCompatible_Level8/{z}/{y}/{x}.jpeg',
      ],
      tileSize: 256,
      maxzoom: 8,
    },
  },
  layers: [{ id: 'earth', type: 'raster', source: 'earth' }],
  sky: { 'atmosphere-blend': 0.9 },
}

const INDIA = [79, 22]
const START_LONGITUDE = 35
const APPROACH_MS = 9000
const DRIFT_DEGREES = 5
const DRIFT_PERIOD_MS = 50000

// Zoom at which the globe is `diameter` pixels across when centred on `latitude`.
function zoomForDiameter(diameter, latitude) {
  return Math.log2((diameter * Math.PI * Math.cos((latitude * Math.PI) / 180)) / 512)
}

// Padding that puts the map centre at pixel (x, y) of a width × height container.
function paddingForCentre(x, y, width, height) {
  return {
    left: Math.max(0, 2 * x - width),
    right: Math.max(0, width - 2 * x),
    top: Math.max(0, 2 * y - height),
    bottom: Math.max(0, height - 2 * y),
  }
}

// `planet` is { x, y, diameter } in pixels: where the Earth sits in the scene.
export default function SplashGlobe({ planet, onShown }) {
  const mapRef = useRef(null)
  const frame = useRef(0)

  useEffect(() => () => cancelAnimationFrame(frame.current), [])

  // Keep the planet where the scene wants it when the window is resized.
  useEffect(() => {
    const map = mapRef.current?.getMap()
    if (!map) return
    const { clientWidth, clientHeight } = map.getContainer()
    map.jumpTo({
      zoom: zoomForDiameter(planet.diameter, INDIA[1]),
      padding: paddingForCentre(planet.x, planet.y, clientWidth, clientHeight),
    })
  }, [planet.x, planet.y, planet.diameter])

  const handleLoad = ({ target: map }) => {
    if (window.matchMedia?.('(prefers-reduced-motion: reduce)').matches) {
      map.jumpTo({ center: INDIA })
      return
    }
    // The Earth turns until India faces the satellite…
    map.easeTo({ center: INDIA, duration: APPROACH_MS, easing: (t) => 1 - (1 - t) ** 3 })
    // …then holds there with a slow east-west drift.
    map.once('moveend', () => {
      const started = performance.now()
      const drift = (now) => {
        const phase = ((now - started) / DRIFT_PERIOD_MS) * 2 * Math.PI
        map.jumpTo({ center: [INDIA[0] + Math.sin(phase) * DRIFT_DEGREES, INDIA[1]] })
        frame.current = requestAnimationFrame(drift)
      }
      frame.current = requestAnimationFrame(drift)
    })
  }

  return (
    <Map
      ref={mapRef}
      initialViewState={{
        longitude: START_LONGITUDE,
        latitude: INDIA[1],
        zoom: zoomForDiameter(planet.diameter, INDIA[1]),
        padding: paddingForCentre(planet.x, planet.y, window.innerWidth, window.innerHeight),
      }}
      mapStyle={GLOBE_STYLE}
      interactive={false}
      attributionControl={false}
      style={{ width: '100%', height: '100%' }}
      onLoad={handleLoad}
      // Reveal the planet as soon as imagery starts arriving, not when every tile is in.
      onData={(event) => event.tile && onShown?.()}
    />
  )
}
