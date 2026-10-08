// Road routing in the browser, on the roads the run published. The roads are a graph whose nodes
// are road vertices (OpenStreetMap ways share a vertex at every junction), the same construction
// the pipeline uses for its cut-off analysis (pipeline/cutoff.py), so the two agree about which
// roads connect. A road section the run flagged as lying in a flood zone is "flagged": the
// avoiding route never uses one, which is the pipeline's rule for "cut off".
//
// Nothing here knows about the map or React: coordinates are [lng, lat], distances are metres.

const EARTH_M = 6371008.8
const M_PER_DEG_LAT = 110540
const rad = (degrees) => (degrees * Math.PI) / 180
const deg = (radians) => (radians * 180) / Math.PI

// Speeds are assumptions, shown as such: nothing in the data says how fast anyone can travel, least
// of all after a flood. On foot it is one pace for every road. By vehicle it depends on the road's
// class in OpenStreetMap, at typical mountain-road speeds; a road with no class gets the default.
export const SPEEDS_KMH = { vehicle: 20, foot: 4 }
export const ROAD_SPEEDS_KMH = {
  motorway: 40,
  trunk: 30,
  primary: 25,
  secondary: 22,
  tertiary: 18,
  unclassified: 14,
  residential: 12,
  service: 10,
  track: 8,
}
// Unsurfaced roads are slower than the same class paved
const UNPAVED = new Set(['unpaved', 'dirt', 'ground', 'gravel', 'fine_gravel', 'earth', 'mud', 'sand', 'grass', 'compacted'])
const UNPAVED_FACTOR = 0.7

// Vehicle speed on a road of this class and surface, km/h
export function roadSpeedKmh(highway, surface) {
  const base = ROAD_SPEEDS_KMH[highway] ?? SPEEDS_KMH.vehicle
  return UNPAVED.has(surface) ? base * UNPAVED_FACTOR : base
}

// OpenStreetMap's one-way tag: 'forward' (along the way as drawn), 'reverse' (-1), or null
export function oneWayDirection(value) {
  if (['yes', '1', 'true'].includes(value)) return 'forward'
  if (value === '-1' || value === 'reverse') return 'reverse'
  return null
}

// A point further than this from any road is not routed from or to.
export const SNAP_LIMIT_M = 2000

export function distanceM(a, b) {
  const dLat = rad(b[1] - a[1])
  const dLng = rad(b[0] - a[0])
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(rad(a[1])) * Math.cos(rad(b[1])) * Math.sin(dLng / 2) ** 2
  return 2 * EARTH_M * Math.asin(Math.min(1, Math.sqrt(h)))
}

// Compass bearing from a to b, 0 to 360.
export function bearing(a, b) {
  const dLng = rad(b[0] - a[0])
  const y = Math.sin(dLng) * Math.cos(rad(b[1]))
  const x = Math.cos(rad(a[1])) * Math.sin(rad(b[1])) - Math.sin(rad(a[1])) * Math.cos(rad(b[1])) * Math.cos(dLng)
  return (deg(Math.atan2(y, x)) + 360) % 360
}

export function compass(bearingDeg) {
  return ['north', 'north-east', 'east', 'south-east', 'south', 'south-west', 'west', 'north-west'][Math.round(bearingDeg / 45) % 8]
}

export const travelMinutes = (metres, mode = 'vehicle') => (metres / 1000 / SPEEDS_KMH[mode]) * 60

// Minutes to travel a route from a point `fromM` metres along it to its end. On foot that is the
// distance at a walking pace; by vehicle it adds up each stretch at its road's speed.
export function routeMinutes(route, mode = 'vehicle', fromM = 0) {
  const remaining = Math.max(0, route.distanceM - fromM)
  if (mode === 'foot' || !route.cumulativeMin) return travelMinutes(remaining, mode)
  return route.cumulativeMin.at(-1) - interpolate(route.cumulative, route.cumulativeMin, Math.min(fromM, route.distanceM))
}

function interpolate(xs, ys, x) {
  if (x <= xs[0]) return ys[0]
  let i = 1
  while (i < xs.length - 1 && xs[i] < x) i++
  const span = xs[i] - xs[i - 1]
  return span > 0 ? ys[i - 1] + ((x - xs[i - 1]) / span) * (ys[i] - ys[i - 1]) : ys[i]
}

// ---------------------------------------------------------------- graph

const keyOf = (c) => `${c[0].toFixed(6)},${c[1].toFixed(6)}`

// Is a point inside a polygon (outer ring first, then holes)?
function inRing(x, y, ring) {
  let inside = false
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    const [xi, yi] = ring[i]
    const [xj, yj] = ring[j]
    if (yi > y !== yj > y && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi) inside = !inside
  }
  return inside
}
const inPolygon = (x, y, rings) => inRing(x, y, rings[0]) && !rings.slice(1).some((hole) => inRing(x, y, hole))

// The flood zones as polygons with bounding boxes, so most points are ruled out cheaply.
function zonePolygons(zones) {
  const polygons = []
  for (const feature of zones?.features ?? []) {
    const g = feature.geometry
    const list = g?.type === 'Polygon' ? [g.coordinates] : g?.type === 'MultiPolygon' ? g.coordinates : []
    for (const rings of list) {
      const xs = rings[0].map((c) => c[0])
      const ys = rings[0].map((c) => c[1])
      polygons.push({ rings, box: [Math.min(...xs), Math.min(...ys), Math.max(...xs), Math.max(...ys)] })
    }
  }
  return polygons
}

// roads: a GeoJSON FeatureCollection of LineStrings with { name, damaged, flooded_km } properties.
// zones (optional): the flood zones. A flagged section is a whole road that touches a zone, but the
// water covers only part of it, so each piece of a flagged road is also tested against the zones:
// that is the stretch a route is told is flooded, and the one drawn in red.
export function buildRoadGraph(roads, zones = null) {
  const index = new Map()
  const coords = []
  const adj = []
  const ways = []
  const node = (c) => {
    const key = keyOf(c)
    let i = index.get(key)
    if (i === undefined) {
      i = coords.length
      index.set(key, i)
      coords.push([c[0], c[1]])
      adj.push([])
    }
    return i
  }
  for (const feature of roads?.features ?? []) {
    const p = feature.properties ?? {}
    const g = feature.geometry
    const lines = g?.type === 'MultiLineString' ? g.coordinates : g?.type === 'LineString' ? [g.coordinates] : []
    if (lines.length === 0) continue
    const way = ways.length
    ways.push({
      id: p.id ?? null,
      name: p.name || 'Unnamed road',
      flagged: !!p.damaged,
      floodedKm: p.flooded_km ?? null,
      highway: p.highway ?? null,
      speedKmh: roadSpeedKmh(p.highway, p.surface),
      oneway: oneWayDirection(p.oneway),
    })
    for (const line of lines) {
      let previous = null
      for (const c of line) {
        const i = node(c)
        if (previous !== null && previous !== i) {
          const len = distanceM(coords[previous], coords[i])
          // Going with a one-way road's drawn direction is `forward`; the other way is against it
          const oneway = ways[way].oneway
          const forward = { to: i, len, way, flooded: false, against: oneway === 'reverse' }
          const back = { to: previous, len, way, flooded: false, against: oneway === 'forward' }
          forward.twin = back
          back.twin = forward
          adj[previous].push(forward)
          adj[i].push(back)
        }
        previous = i
      }
    }
  }
  // Nodes that touch at least one road section that is not flagged: where the avoiding route can start.
  const clear = adj.map((edges) => edges.some((e) => !ways[e.way].flagged))

  const polygons = zonePolygons(zones)
  if (polygons.length > 0) {
    adj.forEach((edges, from) => {
      for (const edge of edges) {
        // each piece is tested once, from its lower-numbered end
        if (!ways[edge.way].flagged || edge.to < from) continue
        const x = (coords[from][0] + coords[edge.to][0]) / 2
        const y = (coords[from][1] + coords[edge.to][1]) / 2
        const inside = polygons.some(({ box, rings }) => x >= box[0] && x <= box[2] && y >= box[1] && y <= box[3] && inPolygon(x, y, rings))
        edge.flooded = inside
        edge.twin.flooded = inside
      }
    })
  }
  return { coords, adj, ways, clear, zonesKnown: polygons.length > 0 }
}

// The road vertex nearest to a point, within a limit. When flagged sections are being avoided
// only vertices that touch an unflagged section count, as in the pipeline's graph without them.
export function nearestNode(graph, point, { maxM = SNAP_LIMIT_M, avoidFlagged = false } = {}) {
  const kx = Math.cos(rad(point[1])) * ((Math.PI / 180) * EARTH_M)
  let best = -1
  let bestSq = Infinity
  for (let i = 0; i < graph.coords.length; i++) {
    if (avoidFlagged && !graph.clear[i]) continue
    const dx = (graph.coords[i][0] - point[0]) * kx
    const dy = (graph.coords[i][1] - point[1]) * M_PER_DEG_LAT
    const sq = dx * dx + dy * dy
    if (sq < bestSq) {
      bestSq = sq
      best = i
    }
  }
  const metres = Math.sqrt(bestSq)
  return best >= 0 && metres <= maxM ? { node: best, offRoadM: metres } : null
}

// A minimal binary heap of [cost, node].
class Heap {
  constructor() {
    this.items = []
  }
  get size() {
    return this.items.length
  }
  push(item) {
    const a = this.items
    a.push(item)
    let i = a.length - 1
    while (i > 0) {
      const parent = (i - 1) >> 1
      if (a[parent][0] <= a[i][0]) break
      ;[a[parent], a[i]] = [a[i], a[parent]]
      i = parent
    }
  }
  pop() {
    const a = this.items
    const top = a[0]
    const last = a.pop()
    if (a.length > 0) {
      a[0] = last
      let i = 0
      for (;;) {
        const l = 2 * i + 1
        const r = l + 1
        let m = i
        if (l < a.length && a[l][0] < a[m][0]) m = l
        if (r < a.length && a[r][0] < a[m][0]) m = r
        if (m === i) break
        ;[a[m], a[i]] = [a[i], a[m]]
        i = m
      }
    }
    return top
  }
}

// Quickest path by vehicle: each stretch costs its length over its road's speed. With avoidFlagged,
// flagged road sections are not used at all. One-way roads can be used either way (the pipeline's
// cut-off graph is undirected, and a rescue vehicle may have to), and the route reports how much of
// it goes against one. Returns the edges walked, or null when the two are not connected.
export function shortestPath(graph, source, target, { avoidFlagged = false } = {}) {
  if (source === target) return []
  const dist = new Map([[source, 0]])
  const via = new Map()
  const heap = new Heap()
  heap.push([0, source])
  while (heap.size > 0) {
    const [cost, here] = heap.pop()
    if (here === target) break
    if (cost > (dist.get(here) ?? Infinity)) continue
    for (const edge of graph.adj[here]) {
      if (avoidFlagged && graph.ways[edge.way].flagged) continue
      const next = cost + edge.len / graph.ways[edge.way].speedKmh
      if (next < (dist.get(edge.to) ?? Infinity)) {
        dist.set(edge.to, next)
        via.set(edge.to, { from: here, to: edge.to, len: edge.len, way: edge.way, flooded: edge.flooded, against: edge.against })
        heap.push([next, edge.to])
      }
    }
  }
  if (!via.has(target)) return null
  const edges = []
  for (let n = target; n !== source; n = via.get(n).from) edges.push(via.get(n))
  return edges.reverse()
}

// ---------------------------------------------------------------- geometry along a route

// The point a given distance along a route.
export function pointAlong({ coordinates, cumulative }, metres) {
  if (coordinates.length === 1 || metres <= 0) return coordinates[0]
  const total = cumulative[cumulative.length - 1]
  if (metres >= total) return coordinates[coordinates.length - 1]
  let i = 1
  while (cumulative[i] < metres) i++
  const span = cumulative[i] - cumulative[i - 1]
  const t = span > 0 ? (metres - cumulative[i - 1]) / span : 0
  const a = coordinates[i - 1]
  const b = coordinates[i]
  return [a[0] + t * (b[0] - a[0]), a[1] + t * (b[1] - a[1])]
}

// Where a point lies relative to a route: how far along it, and how far off it.
// `near` (metres along) limits the search to that stretch so a route that doubles back is not
// confused with itself; with no match inside the stretch the whole route is searched.
export function projectOnRoute({ coordinates, cumulative }, point, near = null) {
  const kx = Math.cos(rad(point[1])) * ((Math.PI / 180) * EARTH_M)
  const search = (from, to) => {
    let best = null
    for (let i = 0; i < coordinates.length - 1; i++) {
      if (cumulative[i + 1] < from || cumulative[i] > to) continue
      const a = coordinates[i]
      const b = coordinates[i + 1]
      const ax = (a[0] - point[0]) * kx
      const ay = (a[1] - point[1]) * M_PER_DEG_LAT
      const dx = (b[0] - a[0]) * kx
      const dy = (b[1] - a[1]) * M_PER_DEG_LAT
      const l2 = dx * dx + dy * dy
      const t = l2 > 0 ? Math.max(0, Math.min(1, -(ax * dx + ay * dy) / l2)) : 0
      const off = Math.hypot(ax + t * dx, ay + t * dy)
      if (!best || off < best.offM) {
        best = {
          offM: off,
          alongM: cumulative[i] + t * (cumulative[i + 1] - cumulative[i]),
          snapped: [a[0] + t * (b[0] - a[0]), a[1] + t * (b[1] - a[1])],
        }
      }
    }
    return best
  }
  if (coordinates.length < 2) {
    return { offM: distanceM(coordinates[0], point), alongM: 0, snapped: coordinates[0] }
  }
  const windowed = near == null ? null : search(near - 300, near + 1500)
  return windowed && windowed.offM < 200 ? windowed : search(-Infinity, Infinity)
}

// ---------------------------------------------------------------- describing a route

const MANEUVERS = [
  [25, 'straight'],
  [60, 'slight'],
  [135, 'turn'],
  [181, 'sharp'],
]

// Turn angle (-180 to 180, positive is right) as a named manoeuvre.
export function classifyTurn(angle) {
  const size = Math.abs(angle)
  const kind = MANEUVERS.find(([limit]) => size < limit)[1]
  return kind === 'straight' ? { kind, side: null } : { kind, side: angle > 0 ? 'right' : 'left' }
}

export function instructionText(step, previous) {
  const road = step.name
  const warning = step.flagged ? ' (part of it in the flood zone)' : ''
  switch (step.maneuver.kind) {
    case 'depart':
      return `Head ${compass(step.heading)} on ${road}${warning}`
    case 'straight':
      return previous?.name === road ? `Continue on ${road}${warning}` : `Continue onto ${road}${warning}`
    case 'slight':
      return `Keep ${step.maneuver.side} onto ${road}${warning}`
    case 'sharp':
      return `Sharp ${step.maneuver.side} onto ${road}${warning}`
    default:
      return `Turn ${step.maneuver.side} onto ${road}${warning}`
  }
}

// Steps are runs of road with the same name, from one change of road to the next. Flooding does not
// start a new step: it is announced separately, by distance.
function buildSteps(graph, edges, route, destinationLabel) {
  const runs = []
  edges.forEach((edge, i) => {
    const way = graph.ways[edge.way]
    const last = runs[runs.length - 1]
    if (last && last.name === way.name) {
      last.distanceM += edge.len
      last.flagged = last.flagged || way.flagged
    } else {
      runs.push({ name: way.name, flagged: way.flagged, startIndex: i, startM: route.cumulative[i], distanceM: edge.len })
    }
  })
  const steps = runs.map((run, k) => {
    const at = route.coordinates[run.startIndex]
    let maneuver = { kind: 'depart', side: null }
    let turn = 0
    const heading = bearing(at, pointAlong(route, run.startM + Math.min(30, run.distanceM)))
    if (k > 0) {
      const incoming = bearing(pointAlong(route, Math.max(0, run.startM - 30)), at)
      turn = ((heading - incoming + 540) % 360) - 180
      maneuver = classifyTurn(turn)
    }
    return { ...run, at, heading, turn, maneuver }
  })
  // A connector of a few metres is not worth announcing: fold it into the road before it.
  const merged = []
  for (const step of steps) {
    const last = merged[merged.length - 1]
    if (last && step.distanceM < 25 && step.maneuver.kind === 'straight') last.distanceM += step.distanceM
    else merged.push(step)
  }
  merged.forEach((step, k) => {
    step.text = instructionText(step, merged[k - 1])
  })
  merged.push({
    name: destinationLabel,
    flagged: false,
    startM: route.cumulative[route.cumulative.length - 1],
    distanceM: 0,
    at: route.coordinates[route.coordinates.length - 1],
    heading: 0,
    turn: 0,
    maneuver: { kind: 'arrive', side: null },
    text: `Arrive at ${destinationLabel}`,
  })
  return merged
}

// Everything the screen needs about one route.
export function describeRoute(graph, edges, { destinationLabel = 'your destination', startNode, infrastructure = [] } = {}) {
  const first = edges.length ? edges[0].from : startNode
  const coordinates = [graph.coords[first], ...edges.map((e) => graph.coords[e.to])]
  const cumulative = [0]
  edges.forEach((e) => cumulative.push(cumulative[cumulative.length - 1] + e.len))
  // Minutes by vehicle at each point of the route, each stretch at its road's speed
  const cumulativeMin = [0]
  edges.forEach((e) => cumulativeMin.push(cumulativeMin[cumulativeMin.length - 1] + (e.len / 1000 / graph.ways[e.way].speedKmh) * 60))
  const route = { coordinates, cumulative, cumulativeMin, distanceM: cumulative[cumulative.length - 1] }

  // Flagged sections the route uses, one entry per stretch of the same road.
  const flaggedSections = []
  edges.forEach((edge, i) => {
    const way = graph.ways[edge.way]
    if (!way.flagged) return
    const last = flaggedSections[flaggedSections.length - 1]
    const flooded = edge.flooded ? edge.len : 0
    if (last && last.endIndex === i && last.name === way.name) {
      last.distanceM += edge.len
      last.floodedM += flooded
      last.endIndex = i + 1
    } else {
      flaggedSections.push({ name: way.name, startIndex: i, endIndex: i + 1, startM: route.cumulative[i], distanceM: edge.len, floodedM: flooded })
    }
  })
  for (const section of flaggedSections) section.coordinates = coordinates.slice(section.startIndex, section.endIndex + 1)

  // The stretches actually inside a flood zone, which is less than the flagged roads they belong to.
  const floodedParts = []
  edges.forEach((edge, i) => {
    if (!edge.flooded) return
    const last = floodedParts[floodedParts.length - 1]
    if (last && last.endIndex === i) {
      last.distanceM += edge.len
      last.endIndex = i + 1
    } else {
      floodedParts.push({ startIndex: i, endIndex: i + 1, startM: route.cumulative[i], distanceM: edge.len })
    }
  })
  for (const part of floodedParts) part.coordinates = coordinates.slice(part.startIndex, part.endIndex + 1)

  // Bridges the run flagged that the route passes over.
  const bridges = infrastructure
    .filter((item) => item.type === 'bridge' && item.status !== 'operational')
    .map((item) => ({ item, hit: projectOnRoute(route, [item.lng, item.lat]) }))
    .filter(({ hit }) => hit.offM <= 40)
    .map(({ item, hit }) => ({ name: item.name, alongM: hit.alongM }))
    .sort((a, b) => a.alongM - b.alongM)

  return {
    ...route,
    steps: edges.length ? buildSteps(graph, edges, route, destinationLabel) : [],
    flaggedSections,
    flaggedM: flaggedSections.reduce((sum, s) => sum + s.distanceM, 0),
    floodedParts,
    // metres of the route that go against a one-way road's direction
    oneWayAgainstM: edges.reduce((sum, e) => sum + (e.against ? e.len : 0), 0),
    // null when the flood zones were not given, so "none" is never claimed without having looked
    floodedM: graph.zonesKnown ? floodedParts.reduce((sum, p) => sum + p.distanceM, 0) : null,
    bridges,
  }
}

// Plans the route between two points both ways: one that avoids every flagged section (null if
// none exists) and the fastest, which may cross them. `error` is set only when no road route
// exists at all.
export function planRoutes(graph, from, to, { destinationLabel, infrastructure = [] } = {}) {
  // `reach` limits how far from the point the road may be found: wide for the fastest route; for
  // the avoiding one, about where the fastest found it, so a place whose only roads are flagged
  // is not "reached" by ending at a clear junction a kilometre away.
  const attempt = (avoidFlagged, reach) => {
    const start = nearestNode(graph, from, { avoidFlagged, maxM: reach?.start ?? SNAP_LIMIT_M })
    const end = nearestNode(graph, to, { avoidFlagged, maxM: reach?.end ?? SNAP_LIMIT_M })
    if (!start || !end) return { reason: !start ? 'start' : 'end' }
    const edges = shortestPath(graph, start.node, end.node, { avoidFlagged })
    if (!edges) return { reason: 'disconnected' }
    const route = describeRoute(graph, edges, { destinationLabel, startNode: start.node, infrastructure })
    return {
      route: {
        ...route,
        start: { point: from, offRoadM: start.offRoadM, joinsAt: route.coordinates[0] },
        end: { point: to, offRoadM: end.offRoadM, joinsAt: route.coordinates[route.coordinates.length - 1] },
      },
    }
  }
  const fastest = attempt(false)
  if (!fastest.route) {
    return {
      error:
        fastest.reason === 'disconnected'
          ? 'The mapped roads do not connect these two places.'
          : `No mapped road within ${SNAP_LIMIT_M / 1000} km of the ${fastest.reason === 'start' ? 'start' : 'destination'}.`,
    }
  }
  const avoiding = attempt(true, { start: fastest.route.start.offRoadM + 100, end: fastest.route.end.offRoadM + 100 })
  return { fastest: fastest.route, avoid: avoiding.route ?? null, avoidBlocked: avoiding.route ? null : avoiding.reason }
}

// The graph is built once per set of roads: it takes a tenth of a second, and every reroute needs it.
const graphs = new WeakMap()
export function roadGraphFor(roads, zones) {
  if (!graphs.has(roads)) graphs.set(roads, buildRoadGraph(roads, zones))
  return graphs.get(roads)
}

// Within this many metres of the route's end, the destination has been reached.
export const ARRIVAL_M = 40

// Where someone is on a route and what comes next, from one GPS position. `previousAlongM` is
// where they were a moment ago, which keeps a route that doubles back from being misread.
export function navigationProgress(route, position, previousAlongM = null) {
  const hit = projectOnRoute(route, position, previousAlongM)
  const remainingM = Math.max(0, route.distanceM - hit.alongM)
  // The turn or arrival still to come, and the road being driven now
  const upcoming = route.steps.find((step) => step.startM > hit.alongM + 10) ?? null
  const current = [...route.steps].reverse().find((step) => step.startM <= hit.alongM + 10) ?? route.steps[0] ?? null
  // The next flooded stretch ahead (or the one being driven through)
  const stretches = route.floodedM == null ? route.flaggedSections : route.floodedParts
  const ahead = stretches.find((stretch) => stretch.startM + stretch.distanceM > hit.alongM)
  return {
    alongM: hit.alongM,
    offM: hit.offM,
    snapped: hit.snapped,
    remainingM,
    current,
    upcoming,
    toUpcomingM: upcoming ? Math.max(0, upcoming.startM - hit.alongM) : remainingM,
    arrived: remainingM <= ARRIVAL_M,
    floodedAhead: ahead
      ? { toM: Math.max(0, ahead.startM - hit.alongM), lengthM: ahead.distanceM, inside: ahead.startM <= hit.alongM }
      : null,
  }
}

// ---------------------------------------------------------------- output

// A circle of a given radius, as a polygon ring, for the GPS accuracy halo.
export function circleRing(centre, radiusM, steps = 48) {
  const kx = Math.cos(rad(centre[1])) * ((Math.PI / 180) * EARTH_M)
  const ring = []
  for (let i = 0; i <= steps; i++) {
    const a = (i / steps) * 2 * Math.PI
    ring.push([centre[0] + (Math.cos(a) * radiusM) / kx, centre[1] + (Math.sin(a) * radiusM) / M_PER_DEG_LAT])
  }
  return ring
}

const escapeXml = (text) => text.replace(/[<>&"]/g, (c) => ({ '<': '&lt;', '>': '&gt;', '&': '&amp;', '"': '&quot;' })[c])

// GPX, so a route can be loaded into a handheld GPS or another navigation app.
export function routeToGpx(route, name) {
  const points = route.coordinates.map(([lng, lat]) => `      <trkpt lat="${lat.toFixed(6)}" lon="${lng.toFixed(6)}"/>`).join('\n')
  return `<?xml version="1.0" encoding="UTF-8"?>
<gpx version="1.1" creator="TANGO" xmlns="http://www.topografix.com/GPX/1/1">
  <trk>
    <name>${escapeXml(name)}</name>
    <trkseg>
${points}
    </trkseg>
  </trk>
</gpx>
`
}
