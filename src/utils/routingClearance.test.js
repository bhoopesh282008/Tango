import { buildRoadGraph, markClearance, nearestNode, planRoutes } from './routing'
import { network, road } from './routing.fixture'

// Two ways from A to C, neither flagged. "Near Road" runs straight along latitude 28.0, about 170 m
// south of a flood zone that sits beside its middle. "Far Road" goes round by latitude 27.99, a
// kilometre south of the zone. 0.01 degrees is about a kilometre.
const A = [85.0, 28.0]
const B = [85.01, 28.0]
const C = [85.02, 28.0]
const SOUTH_A = [85.0, 27.99]
const SOUTH_C = [85.02, 27.99]

const roads = network(
  road('near', 'Near Road', [A, B, C]),
  road('far', 'Far Road', [A, SOUTH_A, SOUTH_C, C]),
)
const zone = {
  type: 'FeatureCollection',
  features: [
    {
      type: 'Feature',
      properties: {},
      geometry: { type: 'Polygon', coordinates: [[[85.008, 28.0015], [85.012, 28.0015], [85.012, 28.0025], [85.008, 28.0025], [85.008, 28.0015]]] },
    },
  ],
}

const wayNamed = (graph, name) => graph.ways.findIndex((w) => w.name === name)
const clearanceOf = (graph, name) =>
  Math.min(...graph.adj.flat().filter((e) => e.way === wayNamed(graph, name)).map((e) => e.clearM))

describe('how close a road comes to a flood zone', () => {
  test('is measured when asked for, and is a safe lower bound', () => {
    const graph = buildRoadGraph(roads, zone)
    expect(graph.clearanceReady).toBe(false)             // not worked out until a clearance is wanted
    markClearance(graph)
    const near = clearanceOf(graph, 'Near Road')
    expect(near).toBeGreaterThan(100)                    // the true gap is about 170 m
    expect(near).toBeLessThan(170)                       // and it is never claimed to be more than that
    expect(clearanceOf(graph, 'Far Road')).toBe(Infinity) // more than the largest margin away
  })

  test('is infinite everywhere when no flood zone is known, so a margin changes nothing', () => {
    const graph = markClearance(buildRoadGraph(roads, null))
    expect(clearanceOf(graph, 'Near Road')).toBe(Infinity)
  })

  test('a road through a zone has none, and one just beside it is not given the benefit of the doubt', () => {
    const through = { type: 'FeatureCollection', features: [{ type: 'Feature', properties: {}, geometry: { type: 'Polygon', coordinates: [[[85.008, 27.9995], [85.012, 27.9995], [85.012, 28.0005], [85.008, 28.0005], [85.008, 27.9995]]] } }] }
    const graph = markClearance(buildRoadGraph(roads, through))
    expect(clearanceOf(graph, 'Near Road')).toBe(0)
  })
})

describe('a route that keeps clear of the flood', () => {
  const graph = buildRoadGraph(roads, zone)
  const plan = (marginM) => planRoutes(graph, A, C, { destinationLabel: 'C', marginM })
  const wayOf = (route) => new Set(route.steps.map((s) => s.name).filter((name) => name !== 'C')) // the last step is the arrival

  test('with no margin the direct road is used, as before', () => {
    const { avoid } = plan(0)
    expect(wayOf(avoid)).toEqual(new Set(['Near Road']))
  })

  test('a margin the near road meets keeps it; one it does not meet sends the route the long way round', () => {
    expect(wayOf(plan(100).avoid)).toEqual(new Set(['Near Road']))
    const round = plan(250).avoid
    expect(wayOf(round)).toEqual(new Set(['Far Road']))
    expect(round.distanceM).toBeGreaterThan(plan(0).avoid.distanceM * 1.5)
    expect(plan(250).marginM).toBe(250)
  })

  test('the fastest route ignores the margin, since it is the one that may cross', () => {
    expect(wayOf(plan(500).fastest)).toEqual(new Set(['Near Road']))
  })

  test('when no road keeps that far away it uses the most room any road gives, and says which', () => {
    const onlyNear = buildRoadGraph(network(road('near', 'Near Road', [A, B, C])), zone)
    const wished = planRoutes(onlyNear, A, C, { destinationLabel: 'C', marginM: 500 })
    expect(wished.marginM).toBe(500)
    expect(wished.achievedM).toBe(100)           // the only road is 170 m off: 250 and 500 are out of reach, 100 is not
    expect(wished.avoid).toBeTruthy()
    // asked for what it can give, it gives it
    expect(planRoutes(onlyNear, A, C, { destinationLabel: 'C', marginM: 100 }).achievedM).toBe(100)
    // asked for nothing, nothing is promised
    expect(planRoutes(onlyNear, A, C, { destinationLabel: 'C' }).achievedM).toBe(0)
  })

  test('a road that is itself flagged is still out, whatever the margin, so there can be no clear route', () => {
    const flagged = buildRoadGraph(network(road('near', 'Near Road', [A, B, C], true)), zone)
    const plan = planRoutes(flagged, A, C, { destinationLabel: 'C', marginM: 250 })
    expect(plan.avoid).toBeNull()
    expect(plan.achievedM).toBeNull()
    expect(plan.avoidBlocked).toBeTruthy()
    expect(plan.fastest).toBeTruthy()
  })

  test('a road with room beyond the margin is chosen over the near one even if longer, up to what was asked', () => {
    const round = planRoutes(graph, A, C, { destinationLabel: 'C', marginM: 500 })
    expect(round.achievedM).toBe(500)
    expect(new Set(round.avoid.steps.map((s) => s.name).filter((name) => name !== 'C'))).toEqual(new Set(['Far Road']))
  })

  test('a start inside the margin is not a place the clear route can start from', () => {
    const onlyNear = buildRoadGraph(network(road('near', 'Near Road', [A, B, C])), zone)
    expect(nearestNode(onlyNear, B, { avoidFlagged: true, marginM: 250 })).toBeNull()
    expect(nearestNode(onlyNear, B, { avoidFlagged: true, marginM: 100 })).not.toBeNull()
  })
})
