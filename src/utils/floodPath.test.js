import { pathFromPoint, settlementsAlong, traceCells } from './floodPath'

// A plane dropping to the south with a channel down column 10 and a pit in it,
// the same shape as the test for pipeline/floodpath.py.
const WIDTH = 21
const HEIGHT = 40
function valley() {
  const heights = new Uint16Array(WIDTH * HEIGHT)
  for (let r = 0; r < HEIGHT; r++) {
    for (let c = 0; c < WIDTH; c++) heights[r * WIDTH + c] = 1000 - 10 * r + 30 * Math.abs(c - 10)
  }
  heights[15 * WIDTH + 10] -= 200
  return heights
}
const rowOf = (cell) => Math.floor(cell / WIDTH)
const colOf = (cell) => cell % WIDTH

test('the trace follows the channel through a pit to the edge', () => {
  const path = traceCells(valley(), WIDTH, HEIGHT, 2 * WIDTH + 10)
  expect(path[0]).toBe(2 * WIDTH + 10)
  expect(rowOf(path.at(-1))).toBe(HEIGHT - 1)
  expect(path).toContain(15 * WIDTH + 10)
  expect(path.every((cell) => Math.abs(colOf(cell) - 10) <= 1)).toBe(true)
  expect(path.map(rowOf)).toEqual([...path.map(rowOf)].sort((a, b) => a - b))
})

test('a trace from a slope joins the channel', () => {
  const path = traceCells(valley(), WIDTH, HEIGHT, 5 * WIDTH + 18)
  expect(rowOf(path.at(-1))).toBe(HEIGHT - 1)
  expect(Math.abs(colOf(path.at(-1)) - 10)).toBeLessThanOrEqual(1)
})

describe('on a georeferenced grid', () => {
  const terrain = { heights: valley(), width: WIDTH, height: HEIGHT, west: 85, north: 28, step: 0.001 }

  test('a point becomes a path heading south, with its length', () => {
    const { line, lengthKm } = pathFromPoint(terrain, 85.0105, 27.9975)
    expect(line[0][1]).toBeGreaterThan(line.at(-1)[1])
    expect(line.every(([lng]) => Math.abs(lng - 85.0105) < 0.0015)).toBe(true)
    // 37 rows of 0.001 degrees of latitude is about 4.1 km
    expect(lengthKm).toBeGreaterThan(3.9)
    expect(lengthKm).toBeLessThan(4.6)
  })

  test('a point outside the grid gives no path', () => {
    expect(pathFromPoint(terrain, 86, 28)).toBeNull()
  })

  test('settlements near the path are listed downstream, others left out', () => {
    const { line } = pathFromPoint(terrain, 85.0105, 27.9975)
    const found = settlementsAlong(line, [
      { id: 'low', name: 'Low', lng: 85.011, lat: 27.97 },
      { id: 'far', name: 'Far', lng: 85.2, lat: 27.98 },
      { id: 'high', name: 'High', lng: 85.01, lat: 27.99 },
    ])
    expect(found.map((s) => s.name)).toEqual(['High', 'Low'])
    expect(found[0].alongKm).toBeLessThan(found[1].alongKm)
  })
})
