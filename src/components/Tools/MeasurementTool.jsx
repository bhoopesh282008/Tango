import { Copy, Trash2, X } from 'lucide-react'
import { CircleMarker, Polygon, Polyline } from 'react-leaflet'
import { useMapStore } from '../../store/mapStore'
import { useUIStore } from '../../store/uiStore'
import { measureAreaKm2, measureDistanceKm } from '../../utils/calculations'
import { copyText } from '../../utils/clipboard'
import { formatArea, formatDistance } from '../../utils/formatters'

const STYLE = { color: '#7c3aed', weight: 3, fillOpacity: 0.15 }

// Rendered inside the Leaflet map: the line or polygon being measured.
export function MeasurementLayer() {
  const mode = useMapStore((s) => s.measureMode)
  const points = useMapStore((s) => s.measurePoints)
  if (!mode || points.length === 0) return null

  const positions = points.map(([lng, lat]) => [lat, lng])
  return (
    <>
      {mode === 'area' && positions.length >= 3 ? (
        <Polygon positions={positions} pathOptions={STYLE} interactive={false} />
      ) : (
        <Polyline positions={positions} pathOptions={STYLE} interactive={false} />
      )}
      {positions.map((position, i) => (
        <CircleMarker
          key={i}
          center={position}
          radius={4}
          pathOptions={{ ...STYLE, fillColor: '#ffffff', fillOpacity: 1, weight: 2 }}
          interactive={false}
        />
      ))}
    </>
  )
}

// Rendered over the map: mode switch and the measured value.
export default function MeasurementTool() {
  const { measureMode, measurePoints, setMeasureMode, clearMeasure } = useMapStore()
  const addToast = useUIStore((s) => s.addToast)
  if (!measureMode) return null

  const needed = measureMode === 'distance' ? 2 : 3
  const ready = measurePoints.length >= needed
  const value =
    measureMode === 'distance'
      ? formatDistance(measureDistanceKm(measurePoints))
      : formatArea(measureAreaKm2(measurePoints))

  const copy = async () => {
    const ok = await copyText(value)
    addToast(ok ? 'Measurement copied' : 'Could not copy', ok ? 'success' : 'error')
  }

  return (
    <div className="card w-64 p-3 text-sm shadow-lg">
      <div className="flex items-center gap-2">
        <div className="flex flex-1">
          {['distance', 'area'].map((mode, i) => (
            <button
              key={mode}
              type="button"
              onClick={() => setMeasureMode(mode)}
              className={`btn flex-1 capitalize ${i === 0 ? 'rounded-r-none' : '-ml-px rounded-l-none'} ${
                measureMode === mode ? 'btn-active' : ''
              }`}
            >
              {mode}
            </button>
          ))}
        </div>
        <button type="button" className="btn w-10 px-0" onClick={() => setMeasureMode(null)} aria-label="Stop measuring">
          <X size={16} />
        </button>
      </div>

      {ready ? (
        <p className="mt-2 text-lg font-semibold" aria-live="polite">
          {value}
        </p>
      ) : (
        <p className="mt-2 text-ink-soft">
          Tap the map to add points ({measurePoints.length} of {needed} minimum).
        </p>
      )}

      <div className="mt-2 flex gap-2">
        <button type="button" className="btn flex-1" onClick={copy} disabled={!ready}>
          <Copy size={14} aria-hidden /> Copy
        </button>
        <button type="button" className="btn flex-1" onClick={clearMeasure} disabled={measurePoints.length === 0}>
          <Trash2 size={14} aria-hidden /> Clear
        </button>
      </div>
    </div>
  )
}
