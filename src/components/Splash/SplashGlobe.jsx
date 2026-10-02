import 'maplibre-gl/dist/maplibre-gl.css'
import '../../config/maplibreWorker'
import { useEffect, useRef } from 'react'
import Map from 'react-map-gl/maplibre'

// Earth as a satellite sees it: NASA Blue Marble imagery on a globe, with space behind.
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
  layers: [
    { id: 'space', type: 'background', paint: { 'background-color': '#05050d' } },
    { id: 'earth', type: 'raster', source: 'earth' },
  ],
  sky: { 'atmosphere-blend': 0.8 },
}

const INDIA = [79, 22]
const START = { longitude: 48, latitude: 8, zoom: 0.9 }
const APPROACH_MS = 9000
const DRIFT_DEGREES = 5
const DRIFT_PERIOD_MS = 50000

export default function SplashGlobe({ onShown }) {
  const frame = useRef(0)

  useEffect(() => () => cancelAnimationFrame(frame.current), [])

  const handleLoad = ({ target: map }) => {
    onShown?.()
    // Smaller screens get a smaller globe so the whole subcontinent stays in view.
    const zoom = map.getContainer().clientWidth < 640 ? 1.5 : 2.1

    if (window.matchMedia?.('(prefers-reduced-motion: reduce)').matches) {
      map.jumpTo({ center: INDIA, zoom })
      return
    }

    // Approach: swing in from over the Arabian Sea and settle above India…
    map.easeTo({ center: INDIA, zoom, duration: APPROACH_MS, easing: (t) => 1 - (1 - t) ** 3 })
    // …then hold station with a slow east-west drift.
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
      initialViewState={START}
      mapStyle={GLOBE_STYLE}
      interactive={false}
      attributionControl={false}
      style={{ width: '100%', height: '100%' }}
      onLoad={handleLoad}
    />
  )
}
