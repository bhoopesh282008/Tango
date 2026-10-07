import { EARTH, formatCoordinates, locate } from './earth'

const near = (value, expected, digits = 3) => expect(value).toBeCloseTo(expected, digits)

test('the point the picture is centred on is at its middle', () => {
  const centre = locate(EARTH.latitude0, EARTH.longitude0)
  near(centre.x, 0.5)
  near(centre.y, 0.5)
  expect(centre.visible).toBe(true)
})

test('north is up and east is right', () => {
  const north = locate(EARTH.latitude0 + 20, EARTH.longitude0)
  const east = locate(EARTH.latitude0, EARTH.longitude0 + 20)
  expect(north.y).toBeLessThan(0.5)
  near(north.x, 0.5)
  expect(east.x).toBeGreaterThan(0.5)
  // a parallel curves on a sphere, so it is only roughly level through the centre
  near(east.y, 0.5, 2)
})

test('twenty degrees east is cos(latitude) * sin(20°) of the planet radius to the right', () => {
  const east = locate(EARTH.latitude0, EARTH.longitude0 + 20)
  const radians = (degrees) => (degrees * Math.PI) / 180
  // 0.5 * disc is the planet's radius as a fraction of the picture's width
  near(east.x - 0.5, 0.5 * EARTH.disc * Math.cos(radians(EARTH.latitude0)) * Math.sin(radians(20)), 6)
})

test('Nepal is on the visible side, in the upper half of the picture', () => {
  const nepal = locate(28.1, 85.3)
  expect(nepal.visible).toBe(true)
  expect(nepal.y).toBeLessThan(0.5)
  expect(nepal.x).toBeGreaterThan(0.45)
  expect(nepal.x).toBeLessThan(0.6)
})

test('places on the far side are not marked', () => {
  expect(locate(-34, -58).visible).toBe(false) // Buenos Aires
  expect(locate(40.7, -74).visible).toBe(false) // New York
  expect(locate(-33.9, 151.2).visible).toBe(true) // Sydney, east of the centre but on this side
})

test('coordinates are written the way a map writes them', () => {
  expect(formatCoordinates(27.98, 85.29)).toBe('28.0°N 85.3°E')
  expect(formatCoordinates(-33.87, -58.4)).toBe('33.9°S 58.4°W')
})
