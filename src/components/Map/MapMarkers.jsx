import L from 'leaflet'
import { CircleMarker, Marker, Popup, Tooltip } from 'react-leaflet'
import { useMapStore } from '../../store/mapStore'
import { INFRA_TYPES } from '../../utils/constants'
import { formatNumber } from '../../utils/formatters'

const STATUS_LABEL = {
  destroyed: 'Destroyed',
  unreachable: 'Unreachable',
  down: 'Down',
  operational: 'Operational',
}

const infraIcon = (letter, damaged) =>
  L.divIcon({
    className: '',
    html: `<div class="infra-icon${damaged ? ' is-damaged' : ''}">${letter}</div>`,
    iconSize: [22, 22],
    iconAnchor: [11, 11],
  })

export function SettlementMarkers({ settlements }) {
  const highlighted = useMapStore((s) => s.highlightedSettlement)

  return settlements.map((s) => {
    const active = highlighted === s.id
    return (
      <CircleMarker
        key={s.id}
        center={[s.lat, s.lng]}
        radius={active ? 13 : 8}
        pathOptions={{
          color: '#ffffff',
          weight: active ? 3 : 2,
          fillColor: s.connected ? '#1f9d55' : '#e03131',
          fillOpacity: 1,
        }}
      >
        <Tooltip direction="top" offset={[0, -8]}>
          {s.name}
        </Tooltip>
        <Popup>
          <strong>{s.name}</strong>
          {s.name_np && <> ({s.name_np})</>}
          <br />
          {formatNumber(s.population)} people
          <br />
          {s.connected ? 'Road access intact' : 'Cut off: no road access'}
        </Popup>
      </CircleMarker>
    )
  })
}

export function InfrastructureMarkers({ infrastructure }) {
  return infrastructure.map((item) => {
    const type = INFRA_TYPES[item.type]
    return (
      <Marker
        key={item.id}
        position={[item.lat, item.lng]}
        icon={infraIcon(type?.letter ?? '?', item.status !== 'operational')}
      >
        <Popup>
          <strong>{item.name}</strong>
          <br />
          {type?.label ?? item.type} · {STATUS_LABEL[item.status] ?? item.status}
          {item.length_km ? ` · ${formatNumber(item.length_km, 1)} km` : ''}
        </Popup>
      </Marker>
    )
  })
}
