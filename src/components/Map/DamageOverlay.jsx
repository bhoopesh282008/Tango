import { useMemo } from 'react'
import { GeoJSON } from 'react-leaflet'
import { useMapStore } from '../../store/mapStore'
import { filterZones } from '../../utils/calculations'
import { DAMAGE_TYPES } from '../../utils/constants'
import { formatNumber, formatPercent } from '../../utils/formatters'
import { escapeHtml } from './popup'

export default function DamageOverlay({ zones, interactive }) {
  const filters = useMapStore((s) => s.filters)
  const data = useMemo(
    () => ({ type: 'FeatureCollection', features: filterZones(zones.features, filters) }),
    [zones, filters],
  )

  return (
    <GeoJSON
      // react-leaflet does not re-read `data` after mount, so remount on change.
      key={`${JSON.stringify(filters)}-${interactive}`}
      data={data}
      interactive={interactive}
      style={(feature) => ({
        color: DAMAGE_TYPES[feature.properties.type].color,
        weight: 1.5,
        fillOpacity: 0.45,
      })}
      onEachFeature={(feature, layer) => {
        const p = feature.properties
        layer.bindPopup(
          `<strong>${escapeHtml(p.name)}</strong><br>${DAMAGE_TYPES[p.type].label} · ${formatNumber(
            p.area_km2,
            1,
          )} km²<br>Confidence ${formatPercent(p.confidence)}`,
        )
      }}
    />
  )
}
