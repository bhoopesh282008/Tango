import {
  bearing,
  buildRoadGraph,
  circleRing,
  classifyTurn,
  distanceM,
  navigationProgress,
  nearestNode,
  oneWayDirection,
  planRoutes,
  pointAlong,
  projectOnRoute,
  ROAD_SPEEDS_KMH,
  roadSpeedKmh,
  routeMinutes,
  routeToGpx,
  shortestPath,
  SPEEDS_KMH,
  travelMinutes,
} from './routing'
import { A, B, C, D, E, full, network, road, zones } from './routing.fixture'

describe('the road graph', () => {
  test('joins roads where they share a vertex, and keeps each section’s flood flag', () => {
    const graph = buildRoadGraph(full)
    expect(graph.coords).toHaveLength(8)
    expect(graph.ways.map((w) => w.flagged)).toEqual([false, true, false])
    // B joins the three sections that meet there (A-B, B-C, B-D)
    const b = nearestNode(graph, B).node
    expect(graph.adj[b]).toHaveLength(3)
  })

  test('finds the nearest road vertex within a limit, and nothing beyond it', () => {
    const graph = buildRoadGraph(full)
    expect(nearestNode(graph, [85.0001, 28.0001]).offRoadM).toBeLessThan(20)
    expect(nearestNode(graph, [86, 29])).toBeNull()
  })

  test('a vertex that touches only flagged sections is not a start when flagged ones are avoided', () => {
    const graph = buildRoadGraph(network(road('r1', 'Main Road', [A, B]), road('r2', 'Main Road', [B, C], true)))
    // C is the end of a flagged section only; the nearest unflagged vertex is B, a kilometre away
    expect(nearestNode(graph, C, { avoidFlagged: true }).offRoadM).toBeGreaterThan(900)
  })
})

describe('shortest path', () => {
  const graph = buildRoadGraph(full)
  const [a, c] = [nearestNode(graph, A).node, nearestNode(graph, C).node]

  test('takes the direct road when flooding is ignored', () => {
    const edges = shortestPath(graph, a, c)
    expect(new Set(edges.map((e) => graph.ways[e.way].name))).toEqual(new Set(['Main Road']))
    expect(edges.every((e) => !graph.ways[e.way].name.includes('Hill'))).toBe(true)
  })

  test('goes round by the hill road when flagged sections are avoided, and is longer', () => {
    const direct = shortestPath(graph, a, c).reduce((s, e) => s + e.len, 0)
    const detour = shortestPath(graph, a, c, { avoidFlagged: true })
    expect(detour.map((e) => graph.ways[e.way].name)).toEqual(['Main Road', 'Hill Road', 'Hill Road', 'Hill Road'])
    expect(detour.reduce((s, e) => s + e.len, 0)).toBeGreaterThan(direct + 1000)
  })

  test('is null when the places are not joined, and empty when they are the same place', () => {
    const island = buildRoadGraph(network(road('r1', 'Main Road', [A, B]), road('r9', 'Far Road', [[86, 29], [86.01, 29]])))
    expect(shortestPath(island, 0, island.coords.length - 1)).toBeNull()
    expect(shortestPath(graph, a, a)).toEqual([])
  })
})

describe('planning a route', () => {
  const bridge = { id: 'b1', type: 'bridge', name: 'Betrawati bridge', lng: 85.015, lat: 28.0, status: 'unreachable' }
  const plan = planRoutes(buildRoadGraph(full), A, C, { destinationLabel: 'Clinic', infrastructure: [bridge] })

  test('gives the fastest route with the flagged section it crosses, and a clear alternative', () => {
    expect(plan.error).toBeUndefined()
    expect(plan.fastest.distanceM).toBeCloseTo(distanceM(A, C), -1)
    expect(plan.fastest.flaggedSections).toHaveLength(1)
    expect(plan.fastest.flaggedSections[0]).toMatchObject({ name: 'Main Road' })
    expect(plan.fastest.flaggedM).toBeCloseTo(distanceM(B, C), -1)
    expect(plan.avoid.flaggedSections).toHaveLength(0)
    expect(plan.avoid.distanceM).toBeGreaterThan(plan.fastest.distanceM)
  })

  test('names a flagged bridge the route passes over', () => {
    expect(plan.fastest.bridges.map((b) => b.name)).toEqual(['Betrawati bridge'])
    expect(plan.avoid.bridges).toEqual([])
  })

  test('directions: head off, turn at the junction, arrive', () => {
    expect(plan.avoid.steps.map((s) => s.text)).toEqual([
      'Head east on Main Road',
      'Turn left onto Hill Road',
      'Arrive at Clinic',
    ])
    // the first step is 1 km, the second the three sides of the detour
    expect(plan.avoid.steps[0].distanceM).toBeCloseTo(distanceM(A, B), -1)
    // the fastest route stays on one road, so it is one step, and says part of it is in the flood zone
    expect(plan.fastest.steps.map((s) => s.text)).toEqual(['Head east on Main Road (part of it in the flood zone)', 'Arrive at Clinic'])
  })

  test('says there is no clear route when the only link is flagged, instead of ending short', () => {
    const only = planRoutes(buildRoadGraph(network(road('r1', 'Main Road', [A, B]), road('r2', 'Main Road', [B, C], true))), A, C)
    expect(only.fastest.flaggedM).toBeGreaterThan(900)
    expect(only.avoid).toBeNull()
    expect(only.avoidBlocked).toBe('end')
  })

  test('reports an error when no road is near, or the two are not connected', () => {
    expect(planRoutes(buildRoadGraph(full), [86, 29], C).error).toMatch(/start/)
    const island = network(road('r1', 'Main Road', [A, B]), road('r9', 'Far Road', [[85.5, 28.5], [85.51, 28.5]]))
    expect(planRoutes(buildRoadGraph(island), A, [85.51, 28.5]).error).toMatch(/do not connect/)
  })
})

describe('how much of the route is actually flooded', () => {
  test('counts only the stretch inside a flood zone, less than the flagged road it belongs to', () => {
    const { fastest, avoid } = planRoutes(buildRoadGraph(full, zones), A, C)
    expect(fastest.floodedParts).toHaveLength(1)
    expect(fastest.floodedM).toBeGreaterThan(400)
    expect(fastest.floodedM).toBeLessThan(600)
    expect(fastest.flaggedM).toBeGreaterThan(900)
    expect(fastest.floodedParts[0].coordinates.length).toBeGreaterThanOrEqual(2)
    expect(avoid.floodedM).toBe(0)
  })

  test('does not claim zero when the flood zones were not given', () => {
    expect(planRoutes(buildRoadGraph(full), A, C).fastest.floodedM).toBeNull()
  })
})

describe('position along a route', () => {
  const { avoid } = planRoutes(buildRoadGraph(full), A, C)

  test('a point on the road is at its distance along it, with no offset', () => {
    const hit = projectOnRoute(avoid, B)
    expect(hit.offM).toBeLessThan(1)
    expect(hit.alongM).toBeCloseTo(distanceM(A, B), -1)
  })

  test('a point beside the road is off it by about the right distance', () => {
    const hit = projectOnRoute(avoid, [85.005, 28.0005])
    expect(hit.offM).toBeGreaterThan(40)
    expect(hit.offM).toBeLessThan(70)
    expect(hit.alongM).toBeCloseTo(distanceM(A, B) / 2, -1)
  })

  test('pointAlong walks the route', () => {
    const half = pointAlong(avoid, avoid.distanceM / 2)
    expect(projectOnRoute(avoid, half).offM).toBeLessThan(1)
    expect(pointAlong(avoid, -5)).toEqual(avoid.coordinates[0])
    expect(pointAlong(avoid, 1e9)).toEqual(avoid.coordinates.at(-1))
  })
})

describe('small helpers', () => {
  test('bearings and turns', () => {
    expect(bearing(A, B)).toBeCloseTo(90, 0)
    expect(bearing(B, D)).toBeCloseTo(0, 0)
    expect(classifyTurn(-90)).toEqual({ kind: 'turn', side: 'left' })
    expect(classifyTurn(10).kind).toBe('straight')
    expect(classifyTurn(40)).toEqual({ kind: 'slight', side: 'right' })
    expect(classifyTurn(170)).toEqual({ kind: 'sharp', side: 'right' })
  })

  test('time is distance over a stated speed', () => {
    expect(travelMinutes(20000, 'vehicle')).toBeCloseTo(60)
    expect(travelMinutes(4000, 'foot')).toBeCloseTo(60)
  })

  test('the accuracy circle closes and has the right radius', () => {
    const ring = circleRing(A, 100)
    expect(ring[0]).toEqual(ring.at(-1))
    expect(distanceM(A, ring[7])).toBeCloseTo(100, 0)
  })

  test('GPX carries every point and escapes the name', () => {
    const { avoid } = planRoutes(buildRoadGraph(full), A, C)
    const gpx = routeToGpx(avoid, 'A & B <route>')
    expect(gpx).toContain('<name>A &amp; B &lt;route&gt;</name>')
    expect(gpx.match(/<trkpt/g)).toHaveLength(avoid.coordinates.length)
  })
})

describe('following a route', () => {
  const graph = buildRoadGraph(full, zones)
  const { fastest, avoid } = planRoutes(graph, A, C, { destinationLabel: 'Clinic' })

  test('at the start: nothing travelled, the first turn ahead, not arrived', () => {
    const p = navigationProgress(avoid, A)
    expect(p.alongM).toBeLessThan(1)
    expect(p.remainingM).toBeCloseTo(avoid.distanceM, -1)
    expect(p.upcoming.text).toBe('Turn left onto Hill Road')
    expect(p.toUpcomingM).toBeCloseTo(distanceM(A, B), -1)
    expect(p.current.text).toBe('Head east on Main Road')
    expect(p.arrived).toBe(false)
  })

  test('past the turn the next thing is the arrival, and at the end it is arrived', () => {
    const p = navigationProgress(avoid, E, distanceM(A, B))
    expect(p.upcoming.text).toBe('Arrive at Clinic')
    expect(p.current.name).toBe('Hill Road')
    expect(navigationProgress(avoid, C).arrived).toBe(true)
  })

  test('on the flooded route it warns how far ahead the water is, then that you are in it', () => {
    const before = navigationProgress(fastest, [85.0105, 28.0])
    expect(before.floodedAhead.inside).toBe(false)
    expect(before.floodedAhead.toM).toBeGreaterThan(100)
    expect(navigationProgress(fastest, [85.015, 28.0]).floodedAhead.inside).toBe(true)
    expect(navigationProgress(avoid, B).floodedAhead).toBeNull()
  })

  test('a position away from the road is reported as off it', () => {
    expect(navigationProgress(avoid, [85.005, 28.002]).offM).toBeGreaterThan(150)
  })
})

describe('road class, surface and one-way roads', () => {
  const classed = (highway, surface = null, oneway = null) => ({
    type: 'Feature',
    properties: { id: 'x', name: 'Road', damaged: false, highway, surface, oneway },
    geometry: { type: 'LineString', coordinates: [A, C] },
  })

  test('a road is driven at the speed of its class, slower where unsurfaced, with a default for no class', () => {
    expect(roadSpeedKmh('trunk')).toBe(ROAD_SPEEDS_KMH.trunk)
    expect(roadSpeedKmh('tertiary', 'gravel')).toBeCloseTo(ROAD_SPEEDS_KMH.tertiary * 0.7)
    expect(roadSpeedKmh('tertiary', 'asphalt')).toBe(ROAD_SPEEDS_KMH.tertiary)
    expect(roadSpeedKmh(null)).toBe(SPEEDS_KMH.vehicle)
    expect(roadSpeedKmh('something_new')).toBe(SPEEDS_KMH.vehicle)
  })

  test('the quickest way beats the shortest when the longer road is faster', () => {
    const graph = buildRoadGraph(network(
      { type: 'Feature', properties: { id: 'a', name: 'Short Track', damaged: false, highway: 'track' }, geometry: { type: 'LineString', coordinates: [A, C] } },
      { type: 'Feature', properties: { id: 'b', name: 'Highway', damaged: false, highway: 'trunk' }, geometry: { type: 'LineString', coordinates: [A, [85.01, 28.004], C] } },
    ))
    const { fastest } = planRoutes(graph, A, C)
    expect(fastest.steps[0].name).toBe('Highway')
    expect(fastest.distanceM).toBeGreaterThan(distanceM(A, C))
    // 2.2 km at 30 km/h, not 2.2 km at the 8 km/h of the track it avoided
    expect(routeMinutes(fastest, 'vehicle')).toBeCloseTo((fastest.distanceM / 1000 / 30) * 60, 1)
  })

  test('minutes by vehicle add up each road at its own speed, and what is left falls as you go', () => {
    const graph = buildRoadGraph(network(
      { type: 'Feature', properties: { id: 'a', name: 'Slow', damaged: false, highway: 'track' }, geometry: { type: 'LineString', coordinates: [A, B] } },
      { type: 'Feature', properties: { id: 'b', name: 'Quick', damaged: false, highway: 'trunk' }, geometry: { type: 'LineString', coordinates: [B, C] } },
    ))
    const { fastest } = planRoutes(graph, A, C)
    const slowM = distanceM(A, B)
    const quickM = distanceM(B, C)
    const total = (slowM / 1000 / 8 + quickM / 1000 / 30) * 60
    expect(routeMinutes(fastest, 'vehicle')).toBeCloseTo(total, 1)
    expect(routeMinutes(fastest, 'vehicle', slowM)).toBeCloseTo((quickM / 1000 / 30) * 60, 1)
    expect(routeMinutes(fastest, 'foot')).toBeCloseTo(travelMinutes(fastest.distanceM, 'foot'), 5)
    expect(routeMinutes(fastest, 'vehicle', fastest.distanceM)).toBeCloseTo(0, 5)
  })

  test('a one-way road can still be used, and the route says how much of it goes against the sign', () => {
    const graph = buildRoadGraph(network(classed('residential', null, 'yes')))
    const along = planRoutes(graph, A, C).fastest
    const against = planRoutes(graph, C, A).fastest
    expect(along.oneWayAgainstM).toBe(0)
    expect(against.oneWayAgainstM).toBeCloseTo(against.distanceM, 0)
    const reversed = planRoutes(buildRoadGraph(network(classed('residential', null, '-1'))), A, C).fastest
    expect(reversed.oneWayAgainstM).toBeCloseTo(reversed.distanceM, 0)
  })

  test('two-way roads and unknown tags never count as against', () => {
    expect(oneWayDirection('no')).toBeNull()
    expect(oneWayDirection(undefined)).toBeNull()
    expect(oneWayDirection('yes')).toBe('forward')
    expect(planRoutes(buildRoadGraph(network(classed('residential'))), C, A).fastest.oneWayAgainstM).toBe(0)
  })
})
