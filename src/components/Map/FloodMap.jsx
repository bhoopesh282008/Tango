import 'maplibre-gl/dist/maplibre-gl.css'
import '../../config/maplibreWorker'
import { Copy, Layers, Maximize2, Minimize2, Ruler, SlidersHorizontal, Waves, X } from 'lucide-react'
import { motion } from 'motion/react'
import { useEffect, useMemo, useRef, useState } from 'react'
import Map, { Layer, NavigationControl, Popup, ScaleControl, Source } from 'react-map-gl/maplibre'
import {
  FIRST_LABEL_LAYER,
  isDarkBase,
  loadMapStyle,
  MAP_DEFAULTS,
  TERRAIN_SOURCE,
} from '../../config/mapConfig'
import { useMapStore } from '../../store/mapStore'
import { useUIStore } from '../../store/uiStore'
import { filterZones } from '../../utils/calculations'
import { copyText } from '../../utils/clipboard'
import { DAMAGE_TYPES, INFRA_TYPES } from '../../utils/constants'
import { loadTerrain, pathFromPoint, settlementsAlong } from '../../utils/floodPath'
import { formatDistance, formatLatLng, formatNumber, formatPeople, formatPercent } from '../../utils/formatters'
import { WORDING } from '../../utils/wording'
import FilterControls from '../Tools/FilterControls'
import FloodPathTool, { FloodPathLayer } from '../Tools/FloodPathTool'
import MeasurementTool, { MeasurementLayer } from '../Tools/MeasurementTool'
import DamageOverlay from './DamageOverlay'
import Spinner from '../Common/Spinner'
import LayerControl from './LayerControl'
import { InfrastructureMarkers, SettlementLayer, showsAllMarkers, STATUS_LABEL } from './MapMarkers'

// Layers that answer clicks; the click event lists the topmost feature first.
const CLICKABLE_LAYERS = ['zones-fill', 'buildings', 'roads-intact', 'roads-damaged', 'settlements']

const DAMAGED = ['==', ['get', 'damaged'], true]
const visibility = (visible) => ({ visibility: visible ? 'visible' : 'none' })

// Popup text for a clicked map feature.
function describeFeature({ layer, properties: p }) {
  switch (layer.id) {
    case 'settlements':
      return {
        title: p.name_np ? `${p.name} (${p.name_np})` : p.name,
        lines: [
          // Where the population is not recorded, the mapped buildings give the size.
          p.population == null && p.total != null
            ? `${formatNumber(p.total)} mapped buildings, ${formatNumber(p.damaged)} damaged`
            : formatPeople(p.population),
          p.connected === true
            ? 'Road access intact'
            : p.connected === false
              ? 'Cut off: no road access'
              : 'Road access unknown: no road to it in the pre-event map',
          ...(p.rank ? [`Rescue priority #${p.rank} · ${p.priority}/100`] : []),
        ],
      }
    case 'roads-intact':
    case 'roads-damaged':
      return {
        title: p.name,
        lines: [
          p.damaged && p.flooded_km != null
            ? `${WORDING.status} · ${formatDistance(p.flooded_km)} of ${formatNumber(p.length_km, 1)} km`
            : `${p.damaged ? WORDING.status : 'Passable'} · ${formatNumber(p.length_km, 1)} km`,
        ],
      }
    case 'buildings':
      return { title: 'Building', lines: [p.damaged ? 'Flagged as damaged' : 'No damage detected'] }
    default:
      return {
        title: p.name,
        lines: [
          `${DAMAGE_TYPES[p.type].label} · ${formatNumber(p.area_km2, 1)} km²`,
          `Confidence ${formatPercent(p.confidence)}`,
        ],
      }
  }
}

function describeInfrastructure(item) {
  const type = INFRA_TYPES[item.type]
  const length = item.length_km ? ` · ${formatNumber(item.length_km, 1)} km` : ''
  return {
    lng: item.lng,
    lat: item.lat,
    title: item.name,
    lines: [`${type?.label ?? item.type} · ${STATUS_LABEL[item.status] ?? item.status}${length}`],
  }
}

export default function FloodMap({ data, settlementRows, priority, confidence }) {
  const {
    zoom, center, viewSet, baseMap, visibleLayers, filters, measureMode, pathMode, focus,
    setMeasureMode, setPathMode, setFloodPath, setView, addMeasurePoint,
  } = useMapStore()
  // [west, south, east, north] of the run on screen, when the run records it
  const areaBox = data.satelliteData?.area?.bbox
  // A tool that takes over map clicks is active.
  const toolActive = !!measureMode || pathMode
  const darkMode = useUIStore((s) => s.darkMode)
  const addToast = useUIStore((s) => s.addToast)
  const [panel, setPanel] = useState(null) // 'layers' | 'filters' | null
  const [expanded, setExpanded] = useState(false)
  const [coordinate, setCoordinate] = useState(null)
  const [popup, setPopup] = useState(null)
  const [hovering, setHovering] = useState(false)
  const [mapStyle, setMapStyle] = useState(null)
  const mapRef = useRef(null)
  const sectionRef = useRef(null)

  // The previous style stays on screen until the next one has been fetched.
  useEffect(() => {
    let current = true
    loadMapStyle(baseMap, darkMode).then((style) => current && setMapStyle(style))
    return () => {
      current = false
    }
  }, [baseMap, darkMode])

  // "Show on map" from the priority ranking: bring the map into view and fly to the settlement.
  useEffect(() => {
    if (!focus) return
    const s = focus.settlement
    sectionRef.current?.scrollIntoView({ behavior: 'smooth', block: 'center' })
    mapRef.current?.flyTo({ center: [s.lng, s.lat], zoom: 13 })
    setCoordinate(null)
    setPopup({
      lng: s.lng,
      lat: s.lat,
      ...describeFeature({ layer: { id: 'settlements' }, properties: s }),
    })
  }, [focus])

  // Entering or leaving full screen changes the container size.
  useEffect(() => {
    mapRef.current?.resize()
  }, [expanded])

  const shownZones = useMemo(
    () => filterZones(data.floodZones.features, filters).length,
    [data.floodZones, filters],
  )
  // Lines drawn over the basemap need to contrast with it.
  const darkBase = isDarkBase(baseMap, darkMode)

  const togglePanel = (name) => setPanel((current) => (current === name ? null : name))
  const toggleMeasure = () => {
    setPanel(null)
    setCoordinate(null)
    setPopup(null)
    setMeasureMode(measureMode ? null : 'distance')
  }
  const togglePath = () => {
    setPanel(null)
    setCoordinate(null)
    setPopup(null)
    setPathMode(!pathMode)
  }
  // Trace the drainage path from a clicked point; the DEM is fetched on first use.
  const tracePath = async (lng, lat) => {
    setFloodPath({ status: 'loading' })
    const terrain = await loadTerrain()
    if (!useMapStore.getState().pathMode) return
    if (!terrain) return setFloodPath({ status: 'unavailable' })
    const path = pathFromPoint(terrain, lng, lat)
    setFloodPath(
      path ? { ...path, settlements: settlementsAlong(path.line, data.settlements) } : { status: 'outside' },
    )
  }
  const copyCoordinate = async () => {
    const ok = await copyText(formatLatLng(coordinate))
    addToast(ok ? 'Coordinates copied' : 'Could not copy', ok ? 'success' : 'error')
  }

  const handleClick = (event) => {
    const { lng, lat } = event.lngLat
    if (measureMode) {
      addMeasurePoint([lng, lat])
      return
    }
    if (pathMode) {
      tracePath(lng, lat)
      return
    }
    const feature = event.features?.[0]
    if (feature) {
      setCoordinate(null)
      setPopup({ lng, lat, ...describeFeature(feature) })
    } else {
      setPopup(null)
      setCoordinate({ lat, lng })
    }
  }

  const handleLoad = ({ target: map }) => {
    if (!import.meta.env.DEV) return
    // Handles for the benchmark script in docs/map-library-research.md.
    window.__floodMap = map
    map.once('idle', () => (window.__floodMapReady = performance.now()))
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
    { id: 'path', label: 'Flood path', icon: Waves, active: pathMode, onClick: togglePath },
  ]

  return (
    <section
      ref={sectionRef}
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

      {/* isolate keeps the map's internal z-indexes from covering the page header */}
      <div className={`relative isolate ${expanded ? 'flex-1' : 'h-[60vh] min-h-[360px] lg:h-[560px]'}`}>
        {!mapStyle && (
          <div className="flex h-full items-center justify-center">
            <Spinner label="Loading map" />
          </div>
        )}
        {mapStyle && (
        <Map
          ref={mapRef}
          initialViewState={
            // First showing: fit the area the run covers. After that: where the user left it.
            areaBox && !viewSet
              ? { bounds: [areaBox.slice(0, 2), areaBox.slice(2)], fitBoundsOptions: { padding: 24 } }
              : { longitude: center.lng, latitude: center.lat, zoom }
          }
          minZoom={MAP_DEFAULTS.minZoom}
          maxZoom={MAP_DEFAULTS.maxZoom}
          mapStyle={mapStyle}
          style={{ width: '100%', height: '100%' }}
          // While a tool is active, features must not swallow clicks.
          interactiveLayerIds={toolActive ? [] : CLICKABLE_LAYERS}
          cursor={toolActive ? 'crosshair' : hovering ? 'pointer' : 'grab'}
          onClick={handleClick}
          onMouseEnter={() => setHovering(true)}
          onMouseLeave={() => setHovering(false)}
          onMoveEnd={({ viewState }) =>
            setView({ lat: viewState.latitude, lng: viewState.longitude }, viewState.zoom)
          }
          onLoad={handleLoad}
          // Collapsed to a button: the full credit line ran under the layer panel.
          attributionControl={{ compact: true }}
        >
          <NavigationControl position="top-left" showCompass={false} />
          <ScaleControl position="bottom-right" />

          <Source id="terrain" {...TERRAIN_SOURCE}>
            <Layer
              id="hillshade"
              beforeId={FIRST_LABEL_LAYER}
              type="hillshade"
              layout={visibility(visibleLayers.elevation)}
              paint={{
                'hillshade-exaggeration': 0.55,
                'hillshade-shadow-color': darkBase ? '#000000' : '#5b616b',
                'hillshade-highlight-color': darkBase ? '#4a505b' : '#ffffff',
                'hillshade-accent-color': darkBase ? '#101216' : '#8a909b',
              }}
            />
          </Source>

          <DamageOverlay zones={data.floodZones} visible={visibleLayers.damage} />

          <Source id="buildings" type="geojson" data={data.buildings}>
            <Layer
              id="buildings"
              beforeId={FIRST_LABEL_LAYER}
              type="fill"
              layout={visibility(visibleLayers.buildings)}
              paint={{
                'fill-color': ['case', DAMAGED, '#e03131', '#9ca3af'],
                'fill-outline-color': ['case', DAMAGED, '#e03131', '#6b7280'],
                'fill-opacity': ['case', DAMAGED, 0.75, 0.5],
              }}
            />
          </Source>

          <Source id="roads" type="geojson" data={data.roads}>
            <Layer
              id="roads-intact"
              beforeId={FIRST_LABEL_LAYER}
              type="line"
              filter={['!', DAMAGED]}
              layout={{ ...visibility(visibleLayers.roads), 'line-cap': 'round' }}
              paint={{
                'line-color': darkBase ? '#8a909b' : '#59606b',
                'line-opacity': 0.8,
                'line-width': ['interpolate', ['linear'], ['zoom'], 8, 0.5, 11, 1, 14, 2.5],
              }}
            />
            <Layer
              id="roads-damaged"
              beforeId={FIRST_LABEL_LAYER}
              type="line"
              filter={DAMAGED}
              layout={visibility(visibleLayers.roads)}
              paint={{
                'line-color': '#e03131',
                'line-width': ['interpolate', ['linear'], ['zoom'], 8, 2.5, 14, 5],
                'line-dasharray': [0.6, 1.2],
              }}
            />
          </Source>

          <SettlementLayer
            // Rows carry each settlement's building counts, for the popup
            settlements={settlementRows ?? data.settlements}
            priority={priority}
            visible={visibleLayers.settlements}
            darkBase={darkBase}
          />
          <MeasurementLayer />
          <FloodPathLayer />

          {visibleLayers.infrastructure && (
            <InfrastructureMarkers
              infrastructure={data.infrastructure}
              onSelect={(item) => {
                if (toolActive) return
                setCoordinate(null)
                setPopup(describeInfrastructure(item))
              }}
            />
          )}

          {popup && (
            <Popup
              longitude={popup.lng}
              latitude={popup.lat}
              onClose={() => setPopup(null)}
              closeOnClick={false}
              maxWidth="260px"
            >
              <strong>{popup.title}</strong>
              {popup.lines.map((line) => (
                <div key={line}>{line}</div>
              ))}
            </Popup>
          )}
        </Map>
        )}

        {panel && (
          <motion.div
            key={panel}
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.2, ease: 'easeOut' }}
            className="no-print card panel-glass absolute inset-x-0 bottom-0 z-10 max-h-[70%] overflow-y-auto rounded-b-none p-3 shadow-lg sm:inset-x-auto sm:bottom-auto sm:right-3 sm:top-3 sm:max-h-[calc(100%-1.5rem)] sm:w-72 sm:rounded-b-xl"
          >
            <div className="mb-1 flex items-center justify-between">
              <h3 className="text-sm font-semibold">{panel === 'layers' ? 'Map layers' : 'Filter damage zones'}</h3>
              <button type="button" className="p-2 text-ink-soft" onClick={() => setPanel(null)} aria-label="Close panel">
                <X size={16} />
              </button>
            </div>
            {panel === 'layers' ? <LayerControl confidence={confidence} /> : <FilterControls />}
          </motion.div>
        )}

        <div className="no-print absolute bottom-3 left-3 z-[9] flex flex-col items-start gap-2">
          <MeasurementTool />
          <FloodPathTool />
          {coordinate && !toolActive && (
            <div className="card panel-glass flex items-center gap-1 py-1 pl-3 pr-1 text-sm shadow-md">
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

      <ul className="flex flex-wrap gap-x-4 gap-y-1.5 border-t border-line px-3 py-2.5 text-xs text-ink-soft sm:px-4">
        <li className="flex items-center gap-1.5"><span className="h-3 w-3 rounded-sm bg-water" /> Water</li>
        <li className="flex items-center gap-1.5"><span className="h-3 w-3 rounded-sm bg-debris" /> Debris</li>
        <li className="flex items-center gap-1.5"><span className="h-3 w-3 rounded-sm bg-uncertain" /> Uncertain</li>
        <li className="flex items-center gap-1.5"><span className="h-3 w-3 rounded-full bg-critical" /> Cut off or damaged</li>
        <li className="flex items-center gap-1.5"><span className="h-3 w-3 rounded-full bg-[#1f9d55]" /> Connected or intact</li>
        {data.settlements.some((s) => s.connected == null) && (
          <li className="flex items-center gap-1.5"><span className="h-3 w-3 rounded-full bg-[#868e96]" /> Road access unknown</li>
        )}
        <li>
          B bridge · H health post · P power line
          {!showsAllMarkers(data.infrastructure) && ' (only affected ones shown)'}
        </li>
        <li>Numbers on cut-off settlements: rescue priority rank</li>
      </ul>
    </section>
  )
}
