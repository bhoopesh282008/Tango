import { useMemo } from 'react'
import { Layer, Marker, Source } from 'react-map-gl/maplibre'
import { useMapStore } from '../../store/mapStore'
import { INFRA_TYPES } from '../../utils/constants'

export const STATUS_LABEL = {
  destroyed: 'Destroyed',
  unreachable: 'Unreachable',
  down: 'Down',
  operational: 'Operational',
}

export function SettlementLayer({ settlements, visible }) {
  const highlighted = useMapStore((s) => s.highlightedSettlement)
  const data = useMemo(
    () => ({
      type: 'FeatureCollection',
      features: settlements.map(({ lat, lng, ...properties }) => ({
        type: 'Feature',
        geometry: { type: 'Point', coordinates: [lng, lat] },
        properties,
      })),
    }),
    [settlements],
  )
  const isHighlighted = ['==', ['get', 'id'], highlighted ?? '']

  return (
    <Source id="settlements" type="geojson" data={data}>
      <Layer
        id="settlements"
        type="circle"
        layout={{ visibility: visible ? 'visible' : 'none' }}
        paint={{
          'circle-radius': ['case', isHighlighted, 13, 8],
          'circle-color': ['case', ['==', ['get', 'connected'], true], '#1f9d55', '#e03131'],
          'circle-stroke-color': '#ffffff',
          'circle-stroke-width': ['case', isHighlighted, 3, 2],
        }}
      />
    </Source>
  )
}

export function InfrastructureMarkers({ infrastructure, onSelect }) {
  return infrastructure.map((item) => {
    const type = INFRA_TYPES[item.type]
    const damaged = item.status !== 'operational'
    return (
      <Marker
        key={item.id}
        longitude={item.lng}
        latitude={item.lat}
        onClick={(e) => {
          // Keep the click from also reaching the map underneath.
          e.originalEvent.stopPropagation()
          onSelect(item)
        }}
      >
        <div
          className={`infra-icon cursor-pointer${damaged ? ' is-damaged' : ''}`}
          title={item.name}
        >
          {type?.letter ?? '?'}
        </div>
      </Marker>
    )
  })
}
