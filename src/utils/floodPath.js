// Traces where water released at a point would travel, from elevation alone.
// The same method as pipeline/floodpath.py: expand outward from the point,
// always taking the lowest cell on the frontier, so the trace follows the valley
// floor and climbs out of pits instead of stopping in them. It ends where the
// path leaves the grid. This is a drainage line, not a flood model.
import { length, lineString, nearestPointOnLine, point } from '@turf/turf'
import { DATA_MODE } from '../config/apiConfig'
import { runBase } from '../config/run'

// A pipeline run carries its own DEM; otherwise the one bundled for the case-study area is used.
const terrainUrl = () => (DATA_MODE === 'pipeline' ? runBase() : '/terrain')
const KM = { units: 'kilometers' }

let terrainRequest = null

// { heights: Uint16Array, width, height, west, north, step }, or null when no DEM is available.
export function loadTerrain() {
  terrainRequest ??= (async () => {
    try {
      const meta = await fetch(`${terrainUrl()}/dem.json`)
      const cells = await fetch(`${terrainUrl()}/dem.bin`)
      if (!meta.ok || !cells.ok) return null
      const info = await meta.json()
      const heights = new Uint16Array(await cells.arrayBuffer())
      return heights.length === info.width * info.height ? { ...info, heights } : null
    } catch {
      return null
    }
  })()
  return terrainRequest
}

// Minimal binary heap of cell indexes, ordered by height.
function makeHeap(heights) {
  const items = []
  const lower = (a, b) => heights[items[a]] < heights[items[b]]
  const swap = (a, b) => ([items[a], items[b]] = [items[b], items[a]])
  return {
    get size() {
      return items.length
    },
    push(cell) {
      let i = items.push(cell) - 1
      while (i > 0) {
        const parent = (i - 1) >> 1
        if (!lower(i, parent)) break
        swap(i, parent)
        i = parent
      }
    },
    pop() {
      const top = items[0]
      const last = items.pop()
      if (items.length) {
        items[0] = last
        let i = 0
        for (;;) {
          const left = 2 * i + 1
          const right = left + 1
          let smallest = i
          if (left < items.length && lower(left, smallest)) smallest = left
          if (right < items.length && lower(right, smallest)) smallest = right
          if (smallest === i) break
          swap(i, smallest)
          i = smallest
        }
      }
      return top
    },
  }
}

// Cell indexes from `start` down to the edge of the grid.
export function traceCells(heights, width, height, start) {
  const parent = new Int32Array(width * height).fill(-2) // -2 unvisited, -1 the start
  const frontier = makeHeap(heights)
  parent[start] = -1
  frontier.push(start)
  while (frontier.size) {
    const cell = frontier.pop()
    const row = Math.floor(cell / width)
    const col = cell % width
    if (cell !== start && (row === 0 || row === height - 1 || col === 0 || col === width - 1)) {
      const path = []
      for (let c = cell; c !== -1; c = parent[c]) path.push(c)
      return path.reverse()
    }
    for (let dr = -1; dr <= 1; dr++) {
      for (let dc = -1; dc <= 1; dc++) {
        const r = row + dr
        const c = col + dc
        if ((dr || dc) && r >= 0 && r < height && c >= 0 && c < width && parent[r * width + c] === -2) {
          parent[r * width + c] = cell
          frontier.push(r * width + c)
        }
      }
    }
  }
  return [start]
}

// Path from a clicked point as [lng, lat] pairs, or null if the point is outside the DEM.
export function pathFromPoint(terrain, lng, lat) {
  const { heights, width, height, west, north, step } = terrain
  const col = Math.floor((lng - west) / step)
  const row = Math.floor((north - lat) / step)
  if (row < 0 || row >= height || col < 0 || col >= width) return null
  const cells = traceCells(heights, width, height, row * width + col)
  if (cells.length < 2) return null
  const line = cells.map((cell) => [
    west + ((cell % width) + 0.5) * step,
    north - (Math.floor(cell / width) + 0.5) * step,
  ])
  return { line, lengthKm: length(lineString(line), KM) }
}

// Settlements within `withinKm` of the path, in downstream order.
export function settlementsAlong(line, settlements, withinKm = 0.5) {
  const path = lineString(line)
  return settlements
    .map((s) => {
      const nearest = nearestPointOnLine(path, point([s.lng, s.lat]), KM)
      return { ...s, offsetKm: nearest.properties.dist, alongKm: nearest.properties.location }
    })
    .filter((s) => s.offsetKm <= withinKm)
    .sort((a, b) => a.alongKm - b.alongKm)
}
