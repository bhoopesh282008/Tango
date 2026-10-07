import { asset } from './assets'

afterEach(() => vi.unstubAllEnvs())

test('at the root of a host a public file is at its own path', () => {
  expect(asset('images/starmap.webp')).toBe('/images/starmap.webp')
  expect(asset('/draco/')).toBe('/draco/')
})

test('under a project path (GitHub Pages) the path is prefixed, whatever the leading slash', () => {
  vi.stubEnv('BASE_URL', '/Tango/')
  expect(asset('images/starmap.webp')).toBe('/Tango/images/starmap.webp')
  expect(asset('/models/jason1.glb')).toBe('/Tango/models/jason1.glb')
  expect(asset('terrain')).toBe('/Tango/terrain')
})
