import { useMemo } from 'react'
import { Layer, Marker, Source } from 'react-map-gl/maplibre'
import { useMapStore } from '../../store/mapStore'
import { INFRA_TYPES } from '../../utils/constants'
import { WORDING } from '../../utils/wording'

export const STATUS_LABEL = {
  destroyed: WORDING.status,
  unreachable: 'Unreachable',
  down: 'Down',
  operational: 'Operational',
}

export function SettlementLayer({ settlements, priority = [], visible, darkBase }) {
  const highlighted = useMapStore((s) => s.highlightedSettlement)
  const data = useMemo(
    () => ({
      type: 'FeatureCollection',
      features: settlements.map(({ lat, lng, ...properties }) => {
        // Cut-off settlements carry their rescue priority rank and score.
        const ranked = priority.find((p) => p.id === properties.id)
        return {
          type: 'Feature',
          geometry: { type: 'Point', coordinates: [lng, lat] },
          properties: ranked
            ? { ...properties, rank: ranked.rank, priority: ranked.priority }
            : properties,
        }
      }),
    }),
    [settlements, priority],
  )
  const isHighlighted = ['==', ['get', 'id'], highlighted ?? '']
  const layout = { visibility: visible ? 'visible' : 'none' }

  return (
    <Source id="settlements" type="geojson" data={data}>
      <Layer
        id="settlements"
        type="circle"
        layout={layout}
        paint={{
          'circle-radius': ['case', isHighlighted, 13, 8],
          // Green connected, red cut off, grey when access is unknown
          'circle-color': [
            'case',
            ['==', ['get', 'connected'], true], '#1f9d55',
            ['==', ['get', 'connected'], false], '#e03131',
            '#868e96',
          ],
          'circle-stroke-color': '#ffffff',
          'circle-stroke-width': ['case', isHighlighted, 3, 2],
        }}
      />
      <Layer
        id="settlement-rank"
        type="symbol"
        filter={['has', 'rank']}
        layout={{
          ...layout,
          'text-field': ['to-string', ['get', 'rank']],
          'text-font': ['Noto Sans Bold'],
          'text-size': 11,
          // The number belongs to its circle, so it never yields to other labels.
          'text-allow-overlap': true,
          'text-ignore-placement': true,
        }}
        paint={{ 'text-color': '#ffffff' }}
      />
      <Layer
        id="settlement-labels"
        type="symbol"
        layout={{
          ...layout,
          'text-field': ['get', 'name'],
          'text-font': ['Noto Sans Bold'],
          'text-size': 12,
          'text-anchor': 'top',
          'text-offset': [0, 0.9],
        }}
        paint={{
          'text-color': darkBase ? '#ffffff' : '#1a1a1a',
          'text-halo-color': darkBase ? 'rgba(0, 0, 0, 0.85)' : '#ffffff',
          'text-halo-width': 1.5,
        }}
      />
    </Source>
  )
}

// With more items than this, intact ones are left off the map so the affected ones can be seen.
export const MARKER_LIMIT = 40
export const showsAllMarkers = (infrastructure) => infrastructure.length <= MARKER_LIMIT

export function InfrastructureMarkers({ infrastructure, onSelect }) {
  const shown = showsAllMarkers(infrastructure)
    ? infrastructure
    : infrastructure.filter((item) => item.status !== 'operational')
  return shown.map((item) => {
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
