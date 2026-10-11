import { layout } from './SpaceScene'

// Where the satellite's centre is at the end of its pass: its start turned about the planet's
// centre by the sweep, clockwise on the screen (the same turn the stylesheet makes).
function endOfPass({ planet, satellite }) {
  const turn = (satellite.sweep * Math.PI) / 180
  const dx = satellite.x - planet.centre.x
  const dy = satellite.y - planet.centre.y
  return {
    x: planet.centre.x + dx * Math.cos(turn) - dy * Math.sin(turn),
    y: planet.centre.y + dx * Math.sin(turn) + dy * Math.cos(turn),
  }
}

// Every window the satellite is shown in: wide ones, and the narrower ones from 640 px
const WINDOWS = [
  [1920, 1080],
  [1440, 900],
  [1280, 720],
  [1025, 600],
  [1025, 1400],
  [1024, 768],
  [800, 600],
  [768, 1024],
  [640, 900],
  [640, 480],
]

test.each(WINDOWS)('at %i x %i the satellite stays inside the window for its whole pass', (width, height) => {
  const scene = layout(width, height)
  const half = scene.satellite.size / 2
  for (const point of [scene.satellite, endOfPass(scene)]) {
    expect(point.x - half).toBeGreaterThanOrEqual(0)
    expect(point.x + half).toBeLessThanOrEqual(width)
    expect(point.y - half).toBeGreaterThanOrEqual(0)
  }
})

test.each(WINDOWS)('at %i x %i the pass moves to the right, away from the words, and is not long', (width, height) => {
  const scene = layout(width, height)
  expect(scene.satellite.sweep).toBeGreaterThan(0)
  expect(scene.satellite.sweep).toBeLessThanOrEqual(34)
  expect(endOfPass(scene).x).toBeGreaterThan(scene.satellite.x)
})

test.each(WINDOWS.filter(([width]) => width < 1025))(
  'at %i x %i the satellite starts clear of the block of words at the top left',
  (width, height) => {
    const { satellite } = layout(width, height)
    const half = satellite.size / 2
    // the block is 26rem wide after a 40 px margin; its height is taken from the same estimate
    const beside = satellite.x - half >= 40 + 416
    const below = satellite.y - half >= 446 + 0.88 * Math.min(Math.max(width * 0.11, 72), 152)
    expect(beside || below).toBe(true)
  },
)
