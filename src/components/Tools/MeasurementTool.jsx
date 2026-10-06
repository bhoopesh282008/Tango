import { Copy, Trash2, Undo2, X } from 'lucide-react'
import { useMemo } from 'react'
import { Layer, Source } from 'react-map-gl/maplibre'
import { useMapStore } from '../../store/mapStore'
import { useUIStore } from '../../store/uiStore'
import { measureAreaKm2, measureDistanceKm } from '../../utils/calculations'
import { copyText } from '../../utils/clipboard'
import { formatArea, formatDistance } from '../../utils/formatters'

const COLOR = '#7c3aed'

// Rendered inside the map: the line or polygon being measured.
export function MeasurementLayer() {
  const mode = useMapStore((s) => s.measureMode)
  const points = useMapStore((s) => s.measurePoints)

  const data = useMemo(() => {
    const features = points.map((coordinates) => ({
      type: 'Feature',
      geometry: { type: 'Point', coordinates },
      properties: {},
    }))
    if (mode === 'area' && points.length >= 3) {
      features.push({
        type: 'Feature',
        geometry: { type: 'Polygon', coordinates: [[...points, points[0]]] },
        properties: {},
      })
    } else if (points.length >= 2) {
      features.push({
        type: 'Feature',
        geometry: { type: 'LineString', coordinates: points },
        properties: {},
      })
    }
    return { type: 'FeatureCollection', features }
  }, [mode, points])

  return (
    <Source id="measure" type="geojson" data={data}>
      <Layer
        id="measure-fill"
        type="fill"
        filter={['==', ['geometry-type'], 'Polygon']}
        paint={{ 'fill-color': COLOR, 'fill-opacity': 0.15 }}
      />
      <Layer
        id="measure-line"
        type="line"
        filter={['!=', ['geometry-type'], 'Point']}
        paint={{ 'line-color': COLOR, 'line-width': 3 }}
      />
      <Layer
        id="measure-points"
        type="circle"
        filter={['==', ['geometry-type'], 'Point']}
        paint={{
          'circle-radius': 4,
          'circle-color': '#ffffff',
          'circle-stroke-color': COLOR,
          'circle-stroke-width': 2,
        }}
      />
    </Source>
  )
}

// Rendered over the map: mode switch and the measured value.
export default function MeasurementTool() {
  const { measureMode, measurePoints, setMeasureMode, undoMeasurePoint, clearMeasure } = useMapStore()
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
    <div className="card panel-glass w-64 p-3 text-sm shadow-lg">
      <div className="flex items-center gap-2">
        <div className="flex flex-1">
          {['distance', 'area'].map((mode, i) => (
            <button
              key={mode}
              type="button"
              onClick={() => setMeasureMode(mode)}
              aria-pressed={measureMode === mode}
              className={`btn flex-1 capitalize ${i === 0 ? 'rounded-r-none' : '-ml-px rounded-l-none'} ${
                measureMode === mode ? 'btn-active' : ''
              }`}
            >
              {mode}
            </button>
          ))}
        </div>
        <button type="button" className="btn w-10 px-0" onClick={() => setMeasureMode(null)} aria-label="Stop measuring">
          <X size={16} aria-hidden />
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
        <button type="button" className="btn flex-1 px-2" onClick={copy} disabled={!ready}>
          <Copy size={14} aria-hidden /> Copy
        </button>
        {/* A mis-placed point is the usual slip; Clear would throw away the rest as well. */}
        <button type="button" className="btn flex-1 px-2" onClick={undoMeasurePoint} disabled={measurePoints.length === 0}>
          <Undo2 size={14} aria-hidden /> Undo
        </button>
        <button type="button" className="btn flex-1 px-2" onClick={clearMeasure} disabled={measurePoints.length === 0}>
          <Trash2 size={14} aria-hidden /> Clear
        </button>
      </div>
    </div>
  )
}
