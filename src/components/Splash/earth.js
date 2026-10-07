import { asset } from '../../config/assets'

// public/images/earth.webp is NASA's Blue Marble (shaded relief and bathymetry, from NASA GIBS)
// drawn as a sphere seen from space: orthographic, north up, centred on LATITUDE0 / LONGITUDE0,
// lit from the upper left. The planet fills DISC of the picture's width; the rest is the thin
// atmosphere at its edge. Because the picture is made with this exact geometry, any place on
// the visible side can be marked on it with plain trigonometry, with no map library.
export const EARTH = {
  src: asset('images/earth.webp'),
  latitude0: 6,
  longitude0: 84,
  disc: 0.94,
}

const radians = (degrees) => (degrees * Math.PI) / 180

// Where a place falls on the picture, as fractions of its width and height (0 to 1, top left
// is 0,0), and whether it is on the side of the Earth that faces us.
export function locate(latitude, longitude, earth = EARTH) {
  const phi = radians(latitude)
  const phi0 = radians(earth.latitude0)
  const dLambda = radians(longitude - earth.longitude0)
  const facing = Math.sin(phi0) * Math.sin(phi) + Math.cos(phi0) * Math.cos(phi) * Math.cos(dLambda)
  const x = Math.cos(phi) * Math.sin(dLambda)
  const y = Math.cos(phi0) * Math.sin(phi) - Math.sin(phi0) * Math.cos(phi) * Math.cos(dLambda)
  return {
    x: 0.5 + 0.5 * earth.disc * x,
    y: 0.5 - 0.5 * earth.disc * y,
    // Just inside the limb the place is at a grazing angle: not worth marking
    visible: facing > 0.12,
  }
}

// Degrees to the way people write them on a map: 27.9°N 85.3°E
export function formatCoordinates(latitude, longitude) {
  const part = (value, positive, negative) => `${Math.abs(value).toFixed(1)}°${value >= 0 ? positive : negative}`
  return `${part(latitude, 'N', 'S')} ${part(longitude, 'E', 'W')}`
}
