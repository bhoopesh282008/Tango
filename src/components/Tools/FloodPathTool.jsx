import { X } from 'lucide-react'
import { motion } from 'motion/react'
import { useMemo } from 'react'
import { Layer, Source } from 'react-map-gl/maplibre'
import { useMapStore } from '../../store/mapStore'
import { formatNumber } from '../../utils/formatters'

// Blue: the path is where water would run.
const COLOR = '#1e90ff'

// Rendered inside the map: the traced path and its starting point.
export function FloodPathLayer() {
  const path = useMapStore((s) => s.floodPath)
  const data = useMemo(
    () => ({
      type: 'FeatureCollection',
      features: path?.line
        ? [
            { type: 'Feature', geometry: { type: 'LineString', coordinates: path.line }, properties: {} },
            { type: 'Feature', geometry: { type: 'Point', coordinates: path.line[0] }, properties: {} },
          ]
        : [],
    }),
    [path],
  )
  return (
    <Source id="flood-path" type="geojson" data={data}>
      <Layer
        id="flood-path-casing"
        type="line"
        filter={['==', ['geometry-type'], 'LineString']}
        layout={{ 'line-cap': 'round', 'line-join': 'round' }}
        paint={{ 'line-color': '#ffffff', 'line-width': 6, 'line-opacity': 0.9 }}
      />
      <Layer
        id="flood-path-line"
        type="line"
        filter={['==', ['geometry-type'], 'LineString']}
        layout={{ 'line-cap': 'round', 'line-join': 'round' }}
        paint={{ 'line-color': COLOR, 'line-width': 3.5 }}
      />
      <Layer
        id="flood-path-start"
        type="circle"
        filter={['==', ['geometry-type'], 'Point']}
        paint={{
          'circle-radius': 6,
          'circle-color': COLOR,
          'circle-stroke-color': '#ffffff',
          'circle-stroke-width': 2,
        }}
      />
    </Source>
  )
}

// Rendered over the map: instructions, then the settlements along the path.
export default function FloodPathTool() {
  const { pathMode, floodPath: path, setPathMode } = useMapStore()
  if (!pathMode) return null

  return (
    <motion.div
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.2, ease: 'easeOut' }}
      className="card panel-glass max-h-[60%] w-72 overflow-y-auto p-3 text-sm shadow-lg"
    >
      <div className="flex items-center gap-2">
        <h3 className="flex-1 font-semibold">Flood path</h3>
        <button type="button" className="btn w-10 px-0" onClick={() => setPathMode(false)} aria-label="Close flood path tool">
          <X size={16} />
        </button>
      </div>

      <div aria-live="polite">
        {!path && <p className="mt-1 text-ink-soft">Tap a point on the map to trace where water from there would run.</p>}
        {path?.status === 'loading' && <p className="mt-1 text-ink-soft">Loading elevation data…</p>}
        {path?.status === 'unavailable' && (
          <p className="mt-1 text-ink-soft">No elevation data is available for this dataset.</p>
        )}
        {path?.status === 'outside' && (
          <p className="mt-1 text-ink-soft">That point is outside the area covered by the elevation data.</p>
        )}
        {path?.line && (
          <>
            <p className="mt-1 text-2xl font-bold tracking-tight">
              <span className="num">{formatNumber(path.lengthKm, 1)}</span> <span className="text-sm font-medium text-ink-soft">km</span>
            </p>
            <p className="text-xs text-ink-soft">to the edge of the mapped area</p>
            <h4 className="mt-2 text-xs font-semibold uppercase tracking-wide text-ink-soft">
              Settlements within 500 m ({path.settlements.length})
            </h4>
            {path.settlements.length === 0 ? (
              <p className="mt-1 text-ink-soft">None.</p>
            ) : (
              <ol className="mt-1 space-y-1">
                {path.settlements.map((s) => (
                  <li key={s.id} className="flex justify-between gap-3">
                    <span className="min-w-0 truncate">{s.name}</span>
                    <span className="shrink-0 text-ink-soft">{formatNumber(s.alongKm, 1)} km</span>
                  </li>
                ))}
              </ol>
            )}
          </>
        )}
      </div>

      <p className="mt-2 border-t border-line pt-2 text-xs text-ink-soft">
        A drainage line from the Copernicus DEM (30 m). It shows direction only, not depth, width,
        timing or how far a flood would reach.
      </p>
    </motion.div>
  )
}
