import { useMemo } from 'react'
import { Layer, Source } from 'react-map-gl/maplibre'
import { FIRST_LABEL_LAYER } from '../../config/mapConfig'
import { useMapStore } from '../../store/mapStore'
import { zoneFilterExpression } from '../../utils/calculations'
import { DAMAGE_TYPES } from '../../utils/constants'

const TYPE_COLOR = [
  'match',
  ['get', 'type'],
  'water', DAMAGE_TYPES.water.color,
  'debris', DAMAGE_TYPES.debris.color,
  DAMAGE_TYPES.uncertain.color,
]

export default function DamageOverlay({ zones, visible, darkBase = false }) {
  const filters = useMapStore((s) => s.filters)
  const filter = useMemo(() => zoneFilterExpression(filters), [filters])
  // Layers stay mounted and are hidden via layout, so draw order never changes.
  // They sit beneath the place names so those stay readable over flooded areas.
  const layout = { visibility: visible ? 'visible' : 'none' }

  return (
    <Source id="zones" type="geojson" data={zones}>
      {/* Most zones are a few pixels across when the whole valley is in view, and a soft
          glow vanished into the satellite picture. So at overview zooms each zone gets a crisp
          stroke in its own colour over a thin casing that stands off the basemap (light on
          imagery or the dark map, dark on the paper map). Both fade out on the way in; close up
          only the true outline is drawn. */}
      <Layer
        id="zones-casing"
        beforeId={FIRST_LABEL_LAYER}
        type="line"
        filter={filter}
        layout={{ ...layout, 'line-join': 'round', 'line-cap': 'round' }}
        paint={{
          'line-color': darkBase ? '#ffffff' : '#111315',
          'line-width': ['interpolate', ['linear'], ['zoom'], 8, 8, 11, 6.5, 13.5, 0],
          'line-opacity': ['interpolate', ['linear'], ['zoom'], 8, 0.9, 12, 0.7, 13.5, 0],
        }}
      />
      <Layer
        id="zones-halo"
        beforeId={FIRST_LABEL_LAYER}
        type="line"
        filter={filter}
        layout={{ ...layout, 'line-join': 'round', 'line-cap': 'round' }}
        paint={{
          'line-color': TYPE_COLOR,
          'line-width': ['interpolate', ['linear'], ['zoom'], 8, 5, 11, 4, 13.5, 0],
          'line-opacity': ['interpolate', ['linear'], ['zoom'], 8, 1, 12, 0.9, 13.5, 0],
        }}
      />
      <Layer
        id="zones-fill"
        beforeId={FIRST_LABEL_LAYER}
        type="fill"
        filter={filter}
        layout={layout}
        paint={{ 'fill-color': TYPE_COLOR, 'fill-opacity': 0.55 }}
      />
      <Layer
        id="zones-outline"
        beforeId={FIRST_LABEL_LAYER}
        type="line"
        filter={filter}
        layout={layout}
        paint={{ 'line-color': TYPE_COLOR, 'line-width': ['interpolate', ['linear'], ['zoom'], 8, 1, 14, 2] }}
      />
    </Source>
  )
}
