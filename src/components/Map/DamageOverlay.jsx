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

export default function DamageOverlay({ zones, visible }) {
  const filters = useMapStore((s) => s.filters)
  const filter = useMemo(() => zoneFilterExpression(filters), [filters])
  // Layers stay mounted and are hidden via layout, so draw order never changes.
  // They sit beneath the place names so those stay readable over flooded areas.
  const layout = { visibility: visible ? 'visible' : 'none' }

  return (
    <Source id="zones" type="geojson" data={zones}>
      <Layer
        id="zones-fill"
        beforeId={FIRST_LABEL_LAYER}
        type="fill"
        filter={filter}
        layout={layout}
        paint={{ 'fill-color': TYPE_COLOR, 'fill-opacity': 0.45 }}
      />
      <Layer
        id="zones-outline"
        beforeId={FIRST_LABEL_LAYER}
        type="line"
        filter={filter}
        layout={layout}
        paint={{ 'line-color': TYPE_COLOR, 'line-width': 1.5 }}
      />
    </Source>
  )
}
