import { ArrowDownLeft, ArrowDownRight, ArrowUp, ArrowUpLeft, ArrowUpRight, CornerUpLeft, CornerUpRight, Crosshair, Flag, Navigation, TriangleAlert, X } from 'lucide-react'
import { useRouteStore } from '../../store/routeStore'
import { formatDuration, formatMetres } from '../../utils/formatters'
import { routeMinutes } from '../../utils/routing'

// The arrow for a manoeuvre: straight on, slightly, a turn, or sharply to one side.
function icon({ kind, side }) {
  if (kind === 'arrive') return Flag
  if (kind === 'depart') return Navigation
  if (kind === 'straight') return ArrowUp
  const left = side === 'left'
  if (kind === 'slight') return left ? ArrowUpLeft : ArrowUpRight
  if (kind === 'sharp') return left ? ArrowDownLeft : ArrowDownRight
  return left ? CornerUpLeft : CornerUpRight
}

const GPS_NOTE = {
  waiting: 'Waiting for a GPS position…',
  timeout: 'No GPS fix yet. Move to open sky.',
}

// Over the map while following a route: the next instruction, how far is left, and the way out.
export default function NavigationHud({ route, progress }) {
  const gps = useRouteStore((s) => s.gps)
  const gpsMessage = useRouteStore((s) => s.gpsMessage)
  const following = useRouteStore((s) => s.following)
  const travel = useRouteStore((s) => s.travel)
  const { stopNavigation, setFollowing } = useRouteStore.getState()

  const trouble = gps === 'denied' || gps === 'unavailable'
  const next = progress?.upcoming
  const Icon = next ? icon(next.maneuver) : Navigation

  let headline = GPS_NOTE[gps] ?? 'Starting…'
  let sub = null
  if (trouble) {
    headline = 'No position'
    sub = gpsMessage
  } else if (!route) {
    headline = 'No route to follow'
    sub = 'Go back to the route panel and choose another route.'
  } else if (progress?.arrived) {
    headline = 'You have arrived'
    sub = route.steps.at(-1)?.name
  } else if (progress) {
    headline = next ? `${progress.toUpcomingM < 30 ? 'Now' : `In ${formatMetres(progress.toUpcomingM)}`}: ${next.text}` : 'Continue'
    sub = progress.current ? `On ${progress.current.name}` : null
  }

  const offRoute = progress && !progress.arrived && progress.offM > 60
  const flooded = progress?.floodedAhead

  return (
    <>
      <div className="no-print absolute inset-x-3 top-3 z-10 mx-auto max-w-xl rounded-[6px] border border-[var(--border-strong)] bg-[#0b0c0d] text-[#f3f4f6] shadow-lg" role="status" aria-live="polite">
        <div className="flex items-center gap-4 px-4 py-3">
          {trouble ? <TriangleAlert size={30} aria-hidden className="shrink-0" /> : <Icon size={34} strokeWidth={2.4} aria-hidden className="shrink-0" />}
          <div className="min-w-0">
            <p className="text-lg font-semibold leading-tight">{headline}</p>
            {sub && <p className="mt-0.5 truncate text-sm text-[#a3a8b1]">{sub}</p>}
          </div>
        </div>
        {(flooded || offRoute) && !progress?.arrived && (
          <p className="border-t border-white/15 px-4 py-2 text-sm font-medium text-[#ff8a8a]">
            {offRoute
              ? `You are ${formatMetres(progress.offM)} from the route.`
              : flooded.inside
                ? `You are in a flooded stretch: ${formatMetres(flooded.lengthM)} long.`
                : `Flooded stretch in ${formatMetres(flooded.toM)}: ${formatMetres(flooded.lengthM)} long.`}
          </p>
        )}
      </div>

      <div className="no-print absolute inset-x-3 bottom-3 z-10 mx-auto flex max-w-xl items-center gap-3 rounded-[6px] border border-[var(--border-strong)] bg-surface px-4 py-2.5 shadow-lg">
        <div className="min-w-0 flex-1">
          {progress ? (
            <p className="num text-lg font-semibold leading-tight">
              {formatMetres(progress.remainingM)}
              <span className="ml-2 text-sm font-normal text-ink-soft">{formatDuration(routeMinutes(route, travel, progress.alongM))} at assumed speeds</span>
            </p>
          ) : (
            <p className="text-sm text-ink-soft">{route ? `${formatMetres(route.distanceM)} planned` : ''}</p>
          )}
        </div>
        {!following && (
          <button type="button" className="btn" onClick={() => setFollowing(true)}>
            <Crosshair size={16} aria-hidden /> Recentre
          </button>
        )}
        <button type="button" className="btn btn-primary" onClick={stopNavigation}>
          <X size={16} aria-hidden /> {progress?.arrived ? 'Done' : 'End'}
        </button>
      </div>
    </>
  )
}
