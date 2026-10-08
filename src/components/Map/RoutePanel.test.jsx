import { fireEvent, render, screen, within } from '@testing-library/react'
import { act } from 'react'
import { useRouteStore } from '../../store/routeStore'
import { buildRoadGraph, planRoutes } from '../../utils/routing'
import { A, C, full, network, road, zones } from '../../utils/routing.fixture'
import RoutePanel from './RoutePanel'

const data = {
  settlements: [
    { id: 's1', name: 'Alder', lat: A[1], lng: A[0], connected: true },
    { id: 's2', name: 'Birch', lat: C[1], lng: C[0], connected: false },
  ],
  infrastructure: [{ id: 'h1', type: 'health_post', name: 'Clinic', lat: C[1], lng: C[0], status: 'operational' }],
}
const initial = useRouteStore.getState()

// The route between the two ends, planned on the test network as the map would
function planned(roads = full) {
  const from = { key: 'settlement:s1', label: 'Alder', lng: A[0], lat: A[1], source: 'place' }
  const to = { key: 'health:h1', label: 'Clinic', lng: C[0], lat: C[1], source: 'place' }
  const plan = planRoutes(buildRoadGraph(roads, zones), [A[0], A[1]], [C[0], C[1]], { destinationLabel: 'Clinic' })
  act(() => useRouteStore.setState({ from, to, plan, preference: 'avoid' }))
  return plan
}

beforeEach(() => act(() => useRouteStore.setState(initial, true)))

test('offers every place in groups, cut-off settlements apart from the rest', () => {
  render(<RoutePanel data={data} onStart={() => {}} />)
  const to = screen.getByLabelText('To')
  expect(within(to).getByRole('group', { name: 'Health posts' })).toBeInTheDocument()
  expect(within(to).getByRole('group', { name: 'Cut-off settlements' })).toHaveTextContent('Birch')
  expect(within(to).getByRole('group', { name: 'Other settlements' })).toHaveTextContent('Alder')
})

test('tells you what to do until both ends are chosen', () => {
  render(<RoutePanel data={data} onStart={() => {}} />)
  expect(screen.getByText(/Choose a start and a destination/)).toBeInTheDocument()
  expect(screen.queryByRole('button', { name: /Start navigation/ })).not.toBeInTheDocument()
})

test('the route that avoids flooding says so, compares it with the fastest, and starts navigation', () => {
  const onStart = vi.fn()
  planned()
  render(<RoutePanel data={data} onStart={onStart} />)
  expect(screen.getByText('This route uses no road section flagged as flooded.')).toBeInTheDocument()
  expect(screen.getByText(/The fastest route is .* shorter, but passes .* of flooding/)).toBeInTheDocument()
  fireEvent.click(screen.getByRole('button', { name: /Start navigation/ }))
  expect(onStart).toHaveBeenCalled()
})

test('the fastest route says how much of it is flooded and on which road, and offers the clear one', () => {
  planned()
  render(<RoutePanel data={data} onStart={() => {}} />)
  fireEvent.click(screen.getByRole('button', { name: 'Fastest' }))
  expect(screen.getByText(/inside mapped flood zones in 1 place/)).toBeInTheDocument()
  expect(screen.getByText('Main Road')).toBeInTheDocument()
  expect(screen.getByText(/A route that avoids flooded roads exists/)).toBeInTheDocument()
})

test('when no road avoids the flagged sections it says so and offers the route through them', () => {
  planned(network(road('r1', 'Main Road', [A, [85.01, 28.0]]), road('r2', 'Main Road', [[85.01, 28.0], C], true)))
  render(<RoutePanel data={data} onStart={() => {}} />)
  expect(screen.getByText('No road route avoids the flagged sections.')).toBeInTheDocument()
  expect(screen.getByText(/Fastest:/)).toHaveTextContent(/inside mapped flood zones/)
  fireEvent.click(screen.getByRole('button', { name: 'Show the route through them' }))
  expect(useRouteStore.getState().preference).toBe('fastest')
})

test('the time is a stated speed, and changes with how you travel', () => {
  planned()
  render(<RoutePanel data={data} onStart={() => {}} />)
  expect(screen.getByText('About (20 km/h)')).toBeInTheDocument()
  fireEvent.click(screen.getByRole('button', { name: 'On foot' }))
  expect(screen.getByText('About (4 km/h)')).toBeInTheDocument()
  expect(screen.getByText(/assumed speed/)).toBeInTheDocument()
})
