import { Copy, Layers, Maximize2, Minimize2, Ruler, SlidersHorizontal, X } from 'lucide-react'
import { useEffect, useMemo, useState } from 'react'
import { GeoJSON, MapContainer, TileLayer, useMap, useMapEvents } from 'react-leaflet'
import { BASE_MAPS, ELEVATION_LAYER, MAP_DEFAULTS } from '../../config/mapConfig'
import { useMapStore } from '../../store/mapStore'
import { useUIStore } from '../../store/uiStore'
import { filterZones } from '../../utils/calculations'
import { copyText } from '../../utils/clipboard'
import { formatLatLng, formatNumber } from '../../utils/formatters'
import FilterControls from '../Tools/FilterControls'
import MeasurementTool, { MeasurementLayer } from '../Tools/MeasurementTool'
import DamageOverlay from './DamageOverlay'
import LayerControl from './LayerControl'
import { InfrastructureMarkers, SettlementMarkers } from './MapMarkers'
import { escapeHtml } from './popup'

// Keeps the store in step with the map and fixes the size after layout changes.
function ViewSync({ expanded }) {
  const map = useMap()
  const setView = useMapStore((s) => s.setView)

  useMapEvents({
    moveend: () => {
      const { lat, lng } = map.getCenter()
      setView({ lat, lng }, map.getZoom())
    },
  })

  useEffect(() => {
    const timer = setTimeout(() => map.invalidateSize(), 50)
    return () => clearTimeout(timer)
  }, [expanded, map])

  return null
}

function ClickHandler({ onCoordinate }) {
  const measureMode = useMapStore((s) => s.measureMode)
  const addMeasurePoint = useMapStore((s) => s.addMeasurePoint)

  useMapEvents({
    click: ({ latlng }) => {
      if (measureMode) addMeasurePoint([latlng.lng, latlng.lat])
      else onCoordinate(latlng)
    },
  })
  return null
}

const buildingStyle = (feature) =>
  feature.properties.damaged
    ? { color: '#e03131', weight: 1, fillColor: '#e03131', fillOpacity: 0.7 }
    : { color: '#6b7280', weight: 1, fillColor: '#9ca3af', fillOpacity: 0.4 }

const roadStyle = (feature) =>
  feature.properties.damaged
    ? { color: '#e03131', weight: 5, dashArray: '2 8' }
    : { color: '#1a1a1a', weight: 3 }

export default function FloodMap({ data }) {
  const { zoom, center, baseMap, visibleLayers, filters, measureMode, setMeasureMode } = useMapStore()
  const addToast = useUIStore((s) => s.addToast)
  const [panel, setPanel] = useState(null) // 'layers' | 'filters' | null
  const [expanded, setExpanded] = useState(false)
  const [coordinate, setCoordinate] = useState(null)

  // While measuring, features must not swallow clicks or open popups.
  const interactive = !measureMode
  const base = BASE_MAPS[baseMap]
  const shownZones = useMemo(
    () => filterZones(data.floodZones.features, filters).length,
    [data.floodZones, filters],
  )

  const togglePanel = (name) => setPanel((current) => (current === name ? null : name))
  const toggleMeasure = () => {
    setPanel(null)
    setCoordinate(null)
    setMeasureMode(measureMode ? null : 'distance')
  }
  const copyCoordinate = async () => {
    const ok = await copyText(formatLatLng(coordinate))
    addToast(ok ? 'Coordinates copied' : 'Could not copy', ok ? 'success' : 'error')
  }

  const tools = [
    { id: 'layers', label: 'Layers', icon: Layers, active: panel === 'layers', onClick: () => togglePanel('layers') },
    {
      id: 'filters',
      label: 'Filters',
      icon: SlidersHorizontal,
      active: panel === 'filters',
      onClick: () => togglePanel('filters'),
    },
    { id: 'measure', label: 'Measure', icon: Ruler, active: !!measureMode, onClick: toggleMeasure },
  ]

  return (
    <section
      className={
        expanded
          ? 'fixed inset-0 z-[1200] flex flex-col bg-surface'
          : 'card flex flex-col overflow-hidden'
      }
    >
      <div className="flex flex-wrap items-center gap-2 px-3 py-2.5 sm:px-4">
        <h2 className="section-title mr-auto">
          Flood damage map{' '}
          <span className="text-xs font-normal text-ink-soft">
            {shownZones} of {data.floodZones.features.length} zones shown
          </span>
        </h2>
        <div className="no-print flex gap-2">
          {tools.map((tool) => (
            <button
              key={tool.id}
              type="button"
              onClick={tool.onClick}
              aria-pressed={tool.active}
              className={`btn ${tool.active ? 'btn-active' : ''}`}
            >
              <tool.icon size={16} aria-hidden />
              <span className="sr-only sm:not-sr-only">{tool.label}</span>
            </button>
          ))}
          <button
            type="button"
            className="btn w-10 px-0"
            onClick={() => setExpanded((v) => !v)}
            aria-label={expanded ? 'Exit full screen map' : 'Full screen map'}
          >
            {expanded ? <Minimize2 size={16} /> : <Maximize2 size={16} />}
          </button>
        </div>
      </div>

      {/* isolate keeps Leaflet's internal z-indexes from covering the page header */}
      <div className={`relative isolate ${expanded ? 'flex-1' : 'h-[60vh] min-h-[360px] lg:h-[560px]'}`}>
        <MapContainer
          center={[center.lat, center.lng]}
          zoom={zoom}
          minZoom={MAP_DEFAULTS.minZoom}
          maxZoom={MAP_DEFAULTS.maxZoom}
          preferCanvas
          className={`h-full w-full ${measureMode ? '!cursor-crosshair' : ''}`}
        >
          <TileLayer key={baseMap} url={base.url} attribution={base.attribution} maxZoom={base.maxZoom} />
          {visibleLayers.elevation && (
            <TileLayer
              url={ELEVATION_LAYER.url}
              attribution={ELEVATION_LAYER.attribution}
              maxNativeZoom={ELEVATION_LAYER.maxZoom}
              opacity={ELEVATION_LAYER.opacity}
            />
          )}

          {visibleLayers.damage && <DamageOverlay zones={data.floodZones} interactive={interactive} />}

          {visibleLayers.buildings && (
            <GeoJSON
              key={`buildings-${interactive}`}
              data={data.buildings}
              style={buildingStyle}
              interactive={interactive}
              onEachFeature={(feature, layer) =>
                layer.bindPopup(
                  feature.properties.damaged
                    ? '<strong>Building</strong><br>Flagged as damaged'
                    : '<strong>Building</strong><br>No damage detected',
                )
              }
            />
          )}

          {visibleLayers.roads && (
            <GeoJSON
              key={`roads-${interactive}`}
              data={data.roads}
              style={roadStyle}
              interactive={interactive}
              onEachFeature={(feature, layer) => {
                const p = feature.properties
                layer.bindPopup(
                  `<strong>${escapeHtml(p.name)}</strong><br>${
                    p.damaged ? 'Destroyed' : 'Passable'
                  } · ${formatNumber(p.length_km, 1)} km`,
                )
              }}
            />
          )}

          {visibleLayers.infrastructure && <InfrastructureMarkers infrastructure={data.infrastructure} />}
          {visibleLayers.settlements && <SettlementMarkers settlements={data.settlements} />}

          <MeasurementLayer />
          <ViewSync expanded={expanded} />
          <ClickHandler onCoordinate={setCoordinate} />
        </MapContainer>

        {panel && (
          <div className="no-print card absolute inset-x-0 bottom-0 z-[1000] max-h-[70%] overflow-y-auto rounded-b-none p-3 shadow-lg sm:inset-x-auto sm:bottom-auto sm:right-3 sm:top-3 sm:max-h-[calc(100%-1.5rem)] sm:w-72 sm:rounded-b-xl">
            <div className="mb-1 flex items-center justify-between">
              <h3 className="text-sm font-semibold">{panel === 'layers' ? 'Map layers' : 'Filter damage zones'}</h3>
              <button type="button" className="p-2 text-ink-soft" onClick={() => setPanel(null)} aria-label="Close panel">
                <X size={16} />
              </button>
            </div>
            {panel === 'layers' ? <LayerControl /> : <FilterControls />}
          </div>
        )}

        <div className="no-print absolute bottom-6 left-3 z-[999] flex flex-col items-start gap-2">
          <MeasurementTool />
          {coordinate && !measureMode && (
            <div className="card flex items-center gap-1 py-1 pl-3 pr-1 text-sm shadow-md">
              <span className="font-mono">{formatLatLng(coordinate)}</span>
              <button type="button" className="p-2 text-ink-soft" onClick={copyCoordinate} aria-label="Copy coordinates">
                <Copy size={14} />
              </button>
              <button type="button" className="p-2 text-ink-soft" onClick={() => setCoordinate(null)} aria-label="Dismiss coordinates">
                <X size={14} />
              </button>
            </div>
          )}
        </div>
      </div>

      <ul className="flex flex-wrap gap-x-4 gap-y-1 px-3 py-2 text-xs text-ink-soft sm:px-4">
        <li className="flex items-center gap-1.5"><span className="h-3 w-3 rounded-sm bg-water" /> Water</li>
        <li className="flex items-center gap-1.5"><span className="h-3 w-3 rounded-sm bg-debris" /> Debris</li>
        <li className="flex items-center gap-1.5"><span className="h-3 w-3 rounded-sm bg-uncertain" /> Uncertain</li>
        <li className="flex items-center gap-1.5"><span className="h-3 w-3 rounded-full bg-critical" /> Cut off or damaged</li>
        <li className="flex items-center gap-1.5"><span className="h-3 w-3 rounded-full bg-[#1f9d55]" /> Connected or intact</li>
        <li>B bridge · H health post · P power line</li>
      </ul>
    </section>
  )
}
