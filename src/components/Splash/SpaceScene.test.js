import { layout, wordsEstimate } from './SpaceScene'

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
    const words = wordsEstimate(width)
    const { satellite } = layout(width, height)
    const half = satellite.size / 2
    expect(satellite.x - half >= words.right || satellite.y - half >= words.bottom).toBe(true)
  },
)

test('the satellite keeps off the words as measured on the page, not only as estimated', () => {
  // a taller block than the estimate (a longer translation, say) in a window where the orbit would cross it
  const words = { right: 424, bottom: 640 }
  const { satellite } = layout(768, 1024, words)
  expect(satellite.x - satellite.size / 2).toBeGreaterThanOrEqual(words.right)
})

test.each([
  [390, 800],
  [360, 640],
  [414, 896],
])('on a %i x %i phone the planet rises below the words, not behind the button', (width, height) => {
  for (const words of [wordsEstimate(width), { right: width - 24, bottom: 560 }]) {
    const { planet, satellite } = layout(width, height, words)
    expect(planet.centre.y - planet.radius).toBeGreaterThanOrEqual(words.bottom + 24)
    expect(satellite.shown).toBe(false)
  }
})
