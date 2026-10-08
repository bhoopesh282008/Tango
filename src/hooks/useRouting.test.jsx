import { act, renderHook } from '@testing-library/react'
import { useRouteStore } from '../store/routeStore'
import { distanceM } from '../utils/routing'
import { A, B, C, full, zones } from '../utils/routing.fixture'
import { useRouting } from './useRouting'

const data = { roads: full, floodZones: zones, infrastructure: [] }
const initial = useRouteStore.getState()

let deliver
let watch
let clearWatch
beforeEach(() => {
  useRouteStore.setState(initial, true)
  watch = vi.fn((onFix) => {
    deliver = (point, accuracy = 10) => act(() => onFix({ coords: { longitude: point[0], latitude: point[1], accuracy, heading: null, speed: null } }))
    return 7
  })
  clearWatch = vi.fn()
  Object.defineProperty(navigator, 'geolocation', { value: { watchPosition: watch, clearWatch }, configurable: true })
})

const place = (label, [lng, lat]) => ({ label, lng, lat, source: 'place' })

test('plans the route as soon as both ends are chosen', () => {
  const { result } = renderHook(() => useRouting(data))
  expect(result.current.route).toBeNull()
  act(() => useRouteStore.setState({ from: place('Alder', A), to: place('Clinic', C) }))
  expect(result.current.route.flaggedSections).toHaveLength(0)
  expect(useRouteStore.getState().plan.fastest.flaggedSections).toHaveLength(1)
})

test('while navigating it follows the device, starts the route where the person is, and reports progress', () => {
  const { result } = renderHook(() => useRouting(data))
  act(() => useRouteStore.setState({ from: place('Alder', A), to: place('Clinic', C) }))
  act(() => useRouteStore.getState().startNavigation())
  expect(watch).toHaveBeenCalled()
  expect(result.current.progress).toBeNull() // nothing yet: waiting for a position

  deliver([85.0, 28.0003])
  expect(useRouteStore.getState().from.source).toBe('gps')
  deliver([85.0, 28.0003])
  expect(result.current.progress.remainingM).toBeGreaterThan(3000)

  // 100 m before the junction
  deliver([85.009, 28.0])
  expect(result.current.progress.alongM).toBeCloseTo(distanceM(A, B) - 100, -2)
  expect(result.current.progress.upcoming.text).toBe('Turn left onto Hill Road')
  expect(result.current.progress.toUpcomingM).toBeCloseTo(100, -2)
})

test('three readings off the route plan a new one from where the person is', () => {
  const { result } = renderHook(() => useRouting(data))
  act(() => useRouteStore.setState({ from: place('Alder', A), to: place('Clinic', C) }))
  act(() => useRouteStore.getState().startNavigation())
  deliver(A)
  deliver(A)
  const before = useRouteStore.getState().from
  // 700 m north of the road at the start, where there is no road: three readings
  const off = [85.0, 28.0063]
  deliver(off)
  deliver(off)
  expect(useRouteStore.getState().from).toBe(before)
  deliver(off)
  expect(useRouteStore.getState().from).not.toBe(before)
  expect(useRouteStore.getState().from.lat).toBeCloseTo(off[1], 4)
  expect(result.current.route).not.toBeNull()
})

test('stopping releases the GPS, and a blocked GPS is reported, not ignored', () => {
  renderHook(() => useRouting(data))
  act(() => useRouteStore.setState({ from: place('Alder', A), to: place('Clinic', C) }))
  act(() => useRouteStore.getState().startNavigation())
  act(() => useRouteStore.getState().stopNavigation())
  expect(clearWatch).toHaveBeenCalledWith(7)

  watch.mockImplementationOnce((ok, fail) => {
    fail({ code: 1 })
    return 8
  })
  act(() => useRouteStore.getState().startNavigation())
  expect(useRouteStore.getState().gps).toBe('denied')
  expect(useRouteStore.getState().gpsMessage).toMatch(/blocked/)
})
