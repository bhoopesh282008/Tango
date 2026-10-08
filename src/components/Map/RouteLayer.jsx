import { Flag, Navigation } from 'lucide-react'
import { useMemo } from 'react'
import { Layer, Marker, Source } from 'react-map-gl/maplibre'
import { FIRST_LABEL_LAYER } from '../../config/mapConfig'
import { useRouteStore } from '../../store/routeStore'
import { circleRing } from '../../utils/routing'

const RED = '#e03131'
const line = (coordinates, properties = {}) => ({ type: 'Feature', geometry: { type: 'LineString', coordinates }, properties })
const collection = (features) => ({ type: 'FeatureCollection', features })

// The route is drawn white with a dark edge, so it reads on both satellite photographs and the
// drawn map, and is not a colour that already means something (blue is water, green is connected).
// Red marks the stretches inside a flood zone, as everywhere else on this map.
export default function RouteLayer({ route }) {
  const plan = useRouteStore((s) => s.plan)
  const from = useRouteStore((s) => s.from)
  const to = useRouteStore((s) => s.to)
  const fix = useRouteStore((s) => s.fix)
  const navigating = useRouteStore((s) => s.navigating)

  // The route not chosen, dashed, so the two can be compared on the map
  const other = plan && !plan.error ? (route === plan.avoid ? plan.fastest : plan.avoid) : null
  const showOther = other && other !== route && !navigating

  const main = useMemo(() => {
    if (!route) return collection([])
    const stretches = route.floodedM == null ? route.flaggedSections : route.floodedParts
    const joins = [
      [route.start.point, route.start.joinsAt],
      [route.end.point, route.end.joinsAt],
    ]
      .filter(([a, b]) => a[0] !== b[0] || a[1] !== b[1])
      .map(([a, b]) => line([a, b], { kind: 'join' }))
    return collection([
      line(route.coordinates, { kind: 'route' }),
      ...stretches.map((s) => line(s.coordinates, { kind: 'flooded' })),
      ...joins,
    ])
  }, [route])

  const alt = useMemo(() => {
    if (!showOther) return collection([])
    const stretches = other.floodedM == null ? other.flaggedSections : other.floodedParts
    return collection([line(other.coordinates, { kind: 'route' }), ...stretches.map((s) => line(s.coordinates, { kind: 'flooded' }))])
  }, [showOther, other])

  const accuracy = useMemo(
    () => (fix ? collection([{ type: 'Feature', geometry: { type: 'Polygon', coordinates: [circleRing([fix.lng, fix.lat], Math.max(fix.accuracy ?? 0, 5))] }, properties: {} }]) : collection([])),
    [fix],
  )

  const round = { 'line-cap': 'round', 'line-join': 'round' }
  const isRoute = ['==', ['get', 'kind'], 'route']
  const isFlooded = ['==', ['get', 'kind'], 'flooded']
  const isJoin = ['==', ['get', 'kind'], 'join']

  return (
    <>
      <Source id="route-alt" type="geojson" data={alt}>
        <Layer id="route-alt-line" beforeId={FIRST_LABEL_LAYER} type="line" filter={isRoute} layout={round} paint={{ 'line-color': '#ffffff', 'line-width': 3, 'line-opacity': 0.75, 'line-dasharray': [1.2, 1.6] }} />
        <Layer id="route-alt-flooded" beforeId={FIRST_LABEL_LAYER} type="line" filter={isFlooded} layout={round} paint={{ 'line-color': RED, 'line-width': 5, 'line-opacity': 0.95 }} />
      </Source>

      <Source id="route-main" type="geojson" data={main}>
        <Layer id="route-casing" beforeId={FIRST_LABEL_LAYER} type="line" filter={isRoute} layout={round} paint={{ 'line-color': '#0b0c0d', 'line-width': ['interpolate', ['linear'], ['zoom'], 8, 6, 14, 10], 'line-opacity': 0.85 }} />
        <Layer id="route-line" beforeId={FIRST_LABEL_LAYER} type="line" filter={isRoute} layout={round} paint={{ 'line-color': '#ffffff', 'line-width': ['interpolate', ['linear'], ['zoom'], 8, 3, 14, 6] }} />
        <Layer id="route-flooded" beforeId={FIRST_LABEL_LAYER} type="line" filter={isFlooded} layout={round} paint={{ 'line-color': RED, 'line-width': ['interpolate', ['linear'], ['zoom'], 8, 4, 14, 7] }} />
        <Layer id="route-join" beforeId={FIRST_LABEL_LAYER} type="line" filter={isJoin} layout={round} paint={{ 'line-color': '#ffffff', 'line-width': 2.5, 'line-dasharray': [0.3, 2] }} />
      </Source>

      <Source id="gps-accuracy" type="geojson" data={accuracy}>
        <Layer id="gps-accuracy-fill" beforeId={FIRST_LABEL_LAYER} type="fill" paint={{ 'fill-color': '#ffffff', 'fill-opacity': 0.18 }} />
        <Layer id="gps-accuracy-edge" beforeId={FIRST_LABEL_LAYER} type="line" paint={{ 'line-color': '#ffffff', 'line-width': 1, 'line-opacity': 0.7 }} />
      </Source>

      {from && !fix && from.source !== 'gps' && (
        <Marker longitude={from.lng} latitude={from.lat} anchor="center">
          <div className="h-4 w-4 rounded-full border-[3px] border-[#0b0c0d] bg-white shadow-[0_0_0_2px_#fff]" title={`From: ${from.label}`} />
        </Marker>
      )}
      {to && (
        <Marker longitude={to.lng} latitude={to.lat} anchor="bottom">
          <div className="flex h-8 w-8 items-center justify-center rounded-full border-2 border-white bg-[#0b0c0d] text-white" title={`To: ${to.label}`}>
            <Flag size={15} aria-hidden />
          </div>
        </Marker>
      )}
      {fix && (
        <Marker longitude={fix.lng} latitude={fix.lat} anchor="center">
          <div className="relative flex h-7 w-7 items-center justify-center" title="Your position">
            {/* the arrow turns to the direction of travel when the device reports one */}
            <div className="flex h-7 w-7 items-center justify-center rounded-full border-[3px] border-[#0b0c0d] bg-white text-[#0b0c0d] shadow-[0_0_0_3px_rgba(255,255,255,0.9)]" style={{ transform: `rotate(${fix.heading ?? 0}deg)` }}>
              <Navigation size={14} fill="currentColor" aria-hidden className={fix.heading == null ? 'opacity-0' : ''} />
            </div>
          </div>
        </Marker>
      )}
    </>
  )
}
