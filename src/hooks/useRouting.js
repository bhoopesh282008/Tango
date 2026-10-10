import { useEffect, useMemo, useRef } from 'react'
import { explainGeolocationError, hasGeolocation, holdScreenAwake } from '../services/geolocation'
import { activeRoute, useRouteStore } from '../store/routeStore'
import { useUIStore } from '../store/uiStore'
import { navigationProgress, planRoutes, roadGraphFor } from '../utils/routing'

// Off the route by more than this (or 1.5 times the GPS error, if larger) for three readings in a row
const OFF_ROUTE_M = 60
// Replanning is not repeated more often than this
const REROUTE_EVERY_MS = 15_000

// Runs the routing for the map: plans the route when the two ends are chosen, and while
// navigating follows the device's GPS, works out where it is on the route, and replans when it
// leaves the road. Returns the route on screen and the progress along it (null when not navigating).
export function useRouting(data) {
  const from = useRouteStore((s) => s.from)
  const to = useRouteStore((s) => s.to)
  const plan = useRouteStore((s) => s.plan)
  const preference = useRouteStore((s) => s.preference)
  const marginM = useRouteStore((s) => s.marginM)
  const navigating = useRouteStore((s) => s.navigating)
  const fix = useRouteStore((s) => s.fix)
  const { setPlan, setFrom, setFix, setGps } = useRouteStore.getState()
  const addToast = useUIStore((s) => s.addToast)

  // Plan again whenever either end moves
  useEffect(() => {
    if (!from || !to) {
      setPlan(null)
      return
    }
    const graph = roadGraphFor(data.roads, data.floodZones)
    setPlan(planRoutes(graph, [from.lng, from.lat], [to.lng, to.lat], { destinationLabel: to.label, infrastructure: data.infrastructure, marginM }))
  }, [from, to, data, marginM, setPlan])

  // Follow the device while navigating, and keep the screen on
  useEffect(() => {
    if (!navigating) return undefined
    if (!hasGeolocation()) {
      setGps('unavailable', explainGeolocationError(null))
      return undefined
    }
    let release = () => {}
    let stopped = false
    holdScreenAwake().then((fn) => {
      if (stopped) fn()
      else release = fn
    })
    const watch = navigator.geolocation.watchPosition(
      ({ coords }) =>
        setFix({
          lng: coords.longitude,
          lat: coords.latitude,
          accuracy: coords.accuracy,
          heading: Number.isFinite(coords.heading) ? coords.heading : null,
          speed: Number.isFinite(coords.speed) ? coords.speed : null,
        }),
      (error) => setGps(error.code === 1 ? 'denied' : error.code === 3 ? 'timeout' : 'unavailable', explainGeolocationError(error)),
      { enableHighAccuracy: true, maximumAge: 2000, timeout: 20_000 },
    )
    return () => {
      stopped = true
      navigator.geolocation.clearWatch(watch)
      release()
    }
  }, [navigating, setFix, setGps])

  const route = activeRoute(plan, preference)
  const along = useRef(null)
  const progress = useMemo(
    () => (navigating && fix && route ? navigationProgress(route, [fix.lng, fix.lat], along.current) : null),
    [navigating, fix, route],
  )

  // The first reading makes the start of the route the person's own position; after that, being
  // off the route for three readings in a row plans a new one from where they are.
  const handled = useRef(null)
  const seeded = useRef(false)
  const off = useRef(0)
  const lastReroute = useRef(0)
  useEffect(() => {
    if (!navigating) {
      seeded.current = false
      off.current = 0
      along.current = null
      handled.current = null
      return
    }
    if (!fix || !to || handled.current === fix) return
    handled.current = fix
    const here = { lng: fix.lng, lat: fix.lat, label: 'Your location', source: 'gps' }
    if (!seeded.current) {
      seeded.current = true
      setFrom(here)
      return
    }
    if (!progress) return
    along.current = progress.alongM
    off.current = progress.offM > Math.max(OFF_ROUTE_M, (fix.accuracy ?? 0) * 1.5) ? off.current + 1 : 0
    if (off.current >= 3 && Date.now() - lastReroute.current > REROUTE_EVERY_MS) {
      off.current = 0
      along.current = null
      lastReroute.current = Date.now()
      setFrom(here)
      addToast('Off the route: planning a new one from your position')
    }
  }, [navigating, fix, to, progress, setFrom, addToast])

  return { route, progress }
}
