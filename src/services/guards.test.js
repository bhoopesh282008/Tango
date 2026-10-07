import { DataError, featureCollection, list, record } from './guards'

const zone = { type: 'Feature', geometry: null, properties: { type: 'water', area_km2: 1, confidence: 0.7 } }

test('a well-formed feature collection passes through unchanged', () => {
  const value = { type: 'FeatureCollection', features: [zone] }
  expect(featureCollection(value, 'The flood zones layer', ['type', 'area_km2'])).toBe(value)
})

test('an empty feature collection is valid: a run can find nothing', () => {
  expect(() => featureCollection({ type: 'FeatureCollection', features: [] }, 'The roads layer', ['damaged'])).not.toThrow()
})

test.each([
  ['null', null],
  ['an array', []],
  ['an object without features', { type: 'FeatureCollection' }],
  ['a web page', '<!doctype html>'],
])('a feature collection that is %s is rejected, naming the file', (_, value) => {
  expect(() => featureCollection(value, 'The buildings layer')).toThrow(DataError)
  expect(() => featureCollection(value, 'The buildings layer')).toThrow(/The buildings layer is not in the expected format/)
})

test('a feature without the properties the dashboard reads is rejected', () => {
  const value = { type: 'FeatureCollection', features: [{ type: 'Feature', properties: { type: 'water' } }] }
  expect(() => featureCollection(value, 'The flood zones layer', ['type', 'area_km2', 'confidence'])).toThrow(
    /features with area_km2, confidence/,
  )
})

test('lists are checked for being lists of records with the named keys', () => {
  expect(list([], 'The settlements list', ['id'])).toEqual([])
  expect(list([{ id: 's1', name: 'A' }], 'The settlements list', ['id', 'name'])).toHaveLength(1)
  expect(() => list({}, 'The settlements list')).toThrow(/a list/)
  expect(() => list([1, 2], 'The settlements list')).toThrow(/a list of records/)
  expect(() => list([{ id: 's1' }], 'The settlements list', ['id', 'name'])).toThrow(/records with name/)
})

test('a satellite record must be an object', () => {
  expect(record({ before: null }, 'The satellite scene record')).toEqual({ before: null })
  expect(() => record([], 'The satellite scene record')).toThrow(/an object/)
  expect(() => record(null, 'The satellite scene record')).toThrow(DataError)
})
