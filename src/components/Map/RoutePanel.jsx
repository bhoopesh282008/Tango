import { ArrowUpDown, Download, LocateFixed, MapPin, Navigation, Trash2 } from 'lucide-react'
import { useMemo } from 'react'
import { locateOnce } from '../../services/geolocation'
import { downloadBlob } from '../../services/exportService'
import { activeRoute, useRouteStore } from '../../store/routeStore'
import { useUIStore } from '../../store/uiStore'
import { formatDuration, formatMetres } from '../../utils/formatters'
import { routeMinutes, routeToGpx, SPEEDS_KMH } from '../../utils/routing'
import { filePrefix } from '../../config/run'

// Every place a route can start or end at, in the groups a responder thinks in.
function placeGroups(settlements, infrastructure) {
  const place = (kind, item) => ({ key: `${kind}:${item.id}`, kind, id: item.id, label: item.name, lng: item.lng, lat: item.lat })
  const byName = (a, b) => a.label.localeCompare(b.label)
  const health = infrastructure.filter((i) => i.type === 'health_post').map((i) => place('health', i))
  // Several facilities share the name "Unnamed health facility"; a number tells them apart.
  const total = {}
  const seen = {}
  health.forEach((h) => (total[h.label] = (total[h.label] ?? 0) + 1))
  health.forEach((h) => {
    if (total[h.label] > 1) {
      seen[h.label] = (seen[h.label] ?? 0) + 1
      h.label = `${h.label} ${seen[h.label]}`
    }
  })
  const cutOff = settlements.filter((s) => s.connected === false).map((s) => place('settlement', s)).sort(byName)
  const others = settlements.filter((s) => s.connected !== false).map((s) => place('settlement', s)).sort(byName)
  return [
    { label: 'Health posts', places: health.sort(byName) },
    { label: 'Cut-off settlements', places: cutOff },
    { label: 'Other settlements', places: others },
  ].filter((group) => group.places.length > 0)
}

function PlaceSelect({ id, label, value, groups, onChoose }) {
  const all = groups.flatMap((g) => g.places)
  const known = value?.key && all.some((p) => p.key === value.key)
  return (
    <div>
      <label htmlFor={id} className="label">
        {label}
      </label>
      <select
        id={id}
        value={known ? value.key : value ? '__custom' : ''}
        onChange={(e) => {
          const chosen = all.find((p) => p.key === e.target.value)
          if (chosen) onChoose({ ...chosen, source: 'place' })
        }}
        className="mt-1 min-h-[40px] w-full rounded-[3px] border border-line bg-surface px-2 text-sm text-ink"
      >
        {!value && <option value="">Choose a place…</option>}
        {value && !known && <option value="__custom">{value.label}</option>}
        {groups.map((group) => (
          <optgroup key={group.label} label={group.label}>
            {group.places.map((p) => (
              <option key={p.key} value={p.key}>
                {p.label}
              </option>
            ))}
          </optgroup>
        ))}
      </select>
    </div>
  )
}

const segment = (active) =>
  `min-h-[36px] flex-1 whitespace-nowrap rounded-[3px] px-2 text-sm font-medium transition-colors ${
    active ? 'bg-primary text-[color:var(--on-primary)]' : 'text-ink-soft hover:bg-[var(--surface-2)] hover:text-ink'
  }`

function Pair({ label, value }) {
  return (
    <div>
      <dt className="label">{label}</dt>
      <dd className="num mt-0.5 text-[22px] font-semibold leading-none tracking-tight">{value}</dd>
    </div>
  )
}

// Choose where from and where to, and read the route: how far, which sections of it are flooded,
// and the directions. Following it with GPS starts from here.
export default function RoutePanel({ data, onStart }) {
  const { from, to, pick, preference, travel, plan } = useRouteStore()
  const { setFrom, setTo, swap, setPick, setPreference, setTravel, clearRoute } = useRouteStore.getState()
  const addToast = useUIStore((s) => s.addToast)
  const groups = useMemo(() => placeGroups(data.settlements, data.infrastructure), [data])

  const useMyLocation = async () => {
    try {
      const { lng, lat } = await locateOnce()
      setFrom({ lng, lat, label: 'Your location', source: 'gps' })
    } catch (error) {
      addToast(error.message, 'error')
    }
  }

  const route = activeRoute(plan, preference)
  const other = plan && !plan.error ? (preference === 'avoid' ? plan.fastest : plan.avoid) : null
  const unknownFlood = route && route.floodedM == null
  const floodedLabel = route ? formatMetres(unknownFlood ? route.flaggedM : route.floodedM) : null
  const minutes = route ? routeMinutes(route, travel) : 0
  // By vehicle the time comes from each road's class, so the speed shown is the route's average
  const averageKmh = route && minutes > 0 ? Math.round(route.distanceM / 1000 / (minutes / 60)) : SPEEDS_KMH.vehicle
  // The sections that are actually under water on this route, worst first (all of them if the zones are unknown)
  const listed = !route
    ? []
    : unknownFlood
      ? route.flaggedSections.slice(0, 8)
      : [...route.flaggedSections].filter((s) => s.floodedM > 0).sort((a, b) => b.floodedM - a.floodedM).slice(0, 8)

  const download = () => {
    downloadBlob(routeToGpx(route, `${from.label} to ${to.label}`), `${filePrefix()}-route.gpx`, 'application/gpx+xml')
    addToast('Route downloaded as GPX')
  }

  return (
    <div className="text-sm">
      <div className="space-y-2">
        <div className="flex items-end gap-1.5">
          <div className="min-w-0 flex-1">
            <PlaceSelect id="route-from" label="From" value={from} groups={groups} onChoose={setFrom} />
          </div>
          <button type="button" className="btn w-10 shrink-0 px-0" onClick={useMyLocation} aria-label="Start from my location" title="My location">
            <LocateFixed size={16} aria-hidden />
          </button>
          <button type="button" className="btn w-10 shrink-0 px-0" onClick={() => setPick(pick === 'from' ? null : 'from')} aria-pressed={pick === 'from'} aria-label="Choose the start on the map" title="Choose on the map">
            <MapPin size={16} aria-hidden />
          </button>
        </div>
        <div className="flex items-end gap-1.5">
          <div className="min-w-0 flex-1">
            <PlaceSelect id="route-to" label="To" value={to} groups={groups} onChoose={setTo} />
          </div>
          <button type="button" className="btn w-10 shrink-0 px-0" onClick={swap} disabled={!from || !to} aria-label="Swap start and destination" title="Swap">
            <ArrowUpDown size={16} aria-hidden />
          </button>
          <button type="button" className="btn w-10 shrink-0 px-0" onClick={() => setPick(pick === 'to' ? null : 'to')} aria-pressed={pick === 'to'} aria-label="Choose the destination on the map" title="Choose on the map">
            <MapPin size={16} aria-hidden />
          </button>
        </div>
        {pick && (
          <p className="rounded-[3px] bg-[var(--surface-2)] px-2.5 py-2 text-ink-soft" role="status">
            Tap the map to set the {pick === 'from' ? 'start' : 'destination'}.
          </p>
        )}
      </div>

      <div role="group" aria-label="Route preference" className="mt-3 flex rounded-[4px] border border-line p-0.5">
        <button type="button" aria-pressed={preference === 'avoid'} onClick={() => setPreference('avoid')} className={segment(preference === 'avoid')}>
          Avoid flooded roads
        </button>
        <button type="button" aria-pressed={preference === 'fastest'} onClick={() => setPreference('fastest')} className={segment(preference === 'fastest')}>
          Fastest
        </button>
      </div>

      {!from || !to ? (
        <p className="mt-3 text-ink-soft">Choose a start and a destination, or tap “Route here” on a settlement or health post on the map.</p>
      ) : plan?.error ? (
        <p className="mt-3 text-critical" role="alert">
          {plan.error}
        </p>
      ) : plan && !route ? (
        // Avoiding was asked for and no road avoids the flagged sections
        <div className="mt-3 space-y-2" role="status">
          <p className="font-semibold">No road route avoids the flagged sections.</p>
          <p className="text-ink-soft">
            {plan.avoidBlocked === 'disconnected'
              ? 'Every mapped road between these two places passes a section the analysis flags as lying in a flood zone.'
              : 'The roads at one end of this route are themselves flagged sections.'}{' '}
            The fastest route is dashed on the map, flooded stretches in red.
          </p>
          <p className="num">
            Fastest: <span className="font-semibold">{formatMetres(plan.fastest.distanceM)}</span>
            {plan.fastest.floodedM != null && `, ${formatMetres(plan.fastest.floodedM)} of it inside mapped flood zones`}
            {plan.fastest.floodedM == null && `, ${formatMetres(plan.fastest.flaggedM)} of it on flagged road`}.
          </p>
          <button type="button" className="btn" onClick={() => setPreference('fastest')}>
            Show the route through them
          </button>
        </div>
      ) : route ? (
        <div className="mt-3">
          <dl className="flex gap-6">
            <Pair label="Distance" value={formatMetres(route.distanceM)} />
            <Pair label={`About (${travel === 'foot' ? SPEEDS_KMH.foot : averageKmh} km/h)`} value={formatDuration(minutes)} />
          </dl>
          <div className="mt-3 flex gap-2">
            <button type="button" className="btn btn-primary flex-1" onClick={onStart}>
              <Navigation size={16} aria-hidden /> Start navigation
            </button>
            <button type="button" className="btn w-10 px-0" onClick={download} aria-label="Download the route as GPX" title="Download GPX">
              <Download size={16} aria-hidden />
            </button>
            <button type="button" className="btn w-10 px-0" onClick={clearRoute} aria-label="Clear the route" title="Clear">
              <Trash2 size={16} aria-hidden />
            </button>
          </div>

          <div role="group" aria-label="Travelling by" className="mt-2 inline-flex rounded-[4px] border border-line p-0.5">
            {[
              ['vehicle', 'Vehicle'],
              ['foot', 'On foot'],
            ].map(([id, text]) => (
              <button key={id} type="button" aria-pressed={travel === id} onClick={() => setTravel(id)} className={`${segment(travel === id)} px-3`}>
                {text}
              </button>
            ))}
          </div>
          <p className="mt-1 text-xs text-ink-muted">Time uses assumed speeds: by vehicle each road's class from OpenStreetMap (trunk 30 km/h down to track 8), on foot 4 km/h. Nothing in the data says how fast a road can be travelled, least of all after a flood.</p>

          <div className="mt-3 border-t border-line pt-3">
            {route.flaggedSections.length === 0 ? (
              <p className="font-semibold">This route uses no road section flagged as flooded.</p>
            ) : (
              <>
                <p className="font-semibold text-critical">
                  {unknownFlood ? `${floodedLabel} of flagged road` : `${floodedLabel} inside mapped flood zones`}
                  {' '}in {route.floodedParts.length || route.flaggedSections.length} {(route.floodedParts.length || route.flaggedSections.length) === 1 ? 'place' : 'places'}
                </p>
                <p className="mt-0.5 text-ink-soft">
                  on {route.flaggedSections.length} road {route.flaggedSections.length === 1 ? 'section' : 'sections'} the analysis flags
                  ({formatMetres(route.flaggedM)} of this route).
                </p>
                <ul className="mt-2 space-y-1">
                  {listed.map((s, i) => (
                    <li key={`${s.name}-${i}`} className="flex justify-between gap-3">
                      <span className="min-w-0 truncate">{s.name}</span>
                      <span className="num shrink-0 text-ink-soft">
                        {unknownFlood ? formatMetres(s.distanceM) : `${formatMetres(s.floodedM)} flooded`}
                      </span>
                    </li>
                  ))}
                </ul>
                {route.flaggedSections.length > listed.length && (
                  <p className="mt-1 text-xs text-ink-muted">
                    and {route.flaggedSections.length - listed.length} more flagged sections, with no flooding on the stretch this route uses
                  </p>
                )}
              </>
            )}
            {route.oneWayAgainstM > 20 && (
              <p className="mt-2 text-ink-soft">
                {formatMetres(route.oneWayAgainstM)} of this route goes against a one-way road. Fine on foot; check before driving it.
              </p>
            )}
            {route.bridges.length > 0 && (
              <p className="mt-2">
                <span className="font-semibold">Bridge in flood zone: </span>
                {route.bridges.map((b) => `${b.name} at ${formatMetres(b.alongM)}`).join(', ')}
              </p>
            )}
            {(route.start.offRoadM > 100 || route.end.offRoadM > 100) && (
              <p className="mt-2 text-ink-soft">
                {route.start.offRoadM > 100 && `The start is ${formatMetres(route.start.offRoadM)} from the nearest mapped road. `}
                {route.end.offRoadM > 100 && `The destination is ${formatMetres(route.end.offRoadM)} from the nearest mapped road.`}
              </p>
            )}
            {other && Math.abs(other.distanceM - route.distanceM) > 10 && (
              <p className="mt-2 text-ink-soft">
                {preference === 'avoid'
                  ? `The fastest route is ${formatMetres(route.distanceM - other.distanceM)} shorter, but passes ${other.floodedM == null ? formatMetres(other.flaggedM) + ' of flagged road' : formatMetres(other.floodedM) + ' of flooding'}. It is dashed on the map.`
                  : `A route that avoids flooded roads exists: ${formatMetres(other.distanceM)}, ${formatMetres(other.distanceM - route.distanceM)} longer.`}
                {preference !== 'avoid' && (
                  <>
                    {' '}
                    <button type="button" className="underline" onClick={() => setPreference('avoid')}>
                      Use it
                    </button>
                  </>
                )}
              </p>
            )}
          </div>

          <details className="mt-3 border-t border-line pt-2">
            <summary className="cursor-pointer font-medium">Directions ({route.steps.length} steps)</summary>
            <ol className="mt-2 space-y-2">
              {route.steps.map((step, i) => (
                <li key={i} className="flex justify-between gap-3">
                  <span className={step.flagged ? 'text-critical' : ''}>{step.text}</span>
                  {step.distanceM > 0 && <span className="num shrink-0 text-ink-soft">{formatMetres(step.distanceM)}</span>}
                </li>
              ))}
            </ol>
          </details>

        </div>
      ) : null}

      <p className="mt-3 border-t border-line pt-2 text-xs leading-relaxed text-ink-muted">
        Roads are from OpenStreetMap, before the flood. Flooded stretches come from the satellite analysis, which is a lower bound: a road
        not marked is not known to be passable. Ask local people before you go.
      </p>
    </div>
  )
}
