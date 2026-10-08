// A small road network for tests. 0.01 degrees is about a kilometre.
//
//   D ---- E          Hill Road: B, D, E, C (longer, clear)
//   |      |
//   A -- B == C       Main Road: A to B clear, B to C flagged ("==") with a flood zone over its middle
export const A = [85.0, 28.0]
export const B = [85.01, 28.0]
export const C = [85.02, 28.0]
export const D = [85.01, 28.01]
export const E = [85.02, 28.01]

export const road = (id, name, coordinates, damaged = false) => ({
  type: 'Feature',
  properties: { id, name, damaged, flooded_km: damaged ? 0.9 : 0 },
  geometry: { type: 'LineString', coordinates },
})
export const network = (...features) => ({ type: 'FeatureCollection', features })

export const full = network(
  road('r1', 'Main Road', [A, B]),
  road('r2', 'Main Road', [B, [85.0125, 28.0], [85.015, 28.0], [85.0175, 28.0], C], true),
  road('r3', 'Hill Road', [B, D, E, C]),
)

// A flood zone over the middle of the flagged section: it covers only part of that road
export const zones = {
  type: 'FeatureCollection',
  features: [
    {
      type: 'Feature',
      properties: {},
      geometry: { type: 'Polygon', coordinates: [[[85.0135, 27.999], [85.0165, 27.999], [85.0165, 28.001], [85.0135, 28.001], [85.0135, 27.999]]] },
    },
  ],
}
