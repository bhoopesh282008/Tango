import { fetchData } from '../services/http'

// MapLibre zoom levels are one lower than Leaflet's for the same scale.
export const MAP_DEFAULTS = {
  center: { lat: 28.125, lng: 85.29 },
  zoom: 10,
  minZoom: 4,
  maxZoom: 17,
}

// [minLat, minLng, maxLat, maxLng] sent to the backend as the area of interest
export const EVENT_BBOX = [27.9, 85.1, 28.32, 85.45]

const OPENFREEMAP = 'https://tiles.openfreemap.org'
const GLYPHS = `${OPENFREEMAP}/fonts/{fontstack}/{range}.pbf`
const VECTOR_SOURCE = { type: 'vector', url: `${OPENFREEMAP}/planet` }

// OpenStreetMap tiles carry no district names, so the districts around the
// Trishuli corridor are labelled from this list. Positions are approximate.
const DISTRICTS = [
  { name: 'Rasuwa', at: [85.42, 28.2] },
  { name: 'Nuwakot', at: [85.25, 27.9] },
  { name: 'Dhading', at: [84.95, 27.95] },
  { name: 'Sindhupalchok', at: [85.72, 27.92] },
  { name: 'Gorkha', at: [84.75, 28.3] },
  { name: 'Kathmandu', at: [85.36, 27.76] },
]
const DISTRICT_SOURCE = {
  type: 'geojson',
  data: {
    type: 'FeatureCollection',
    features: DISTRICTS.map(({ name, at }) => ({
      type: 'Feature',
      geometry: { type: 'Point', coordinates: at },
      properties: { name: `${name} District` },
    })),
  },
}

// Latin name with the local-script name after it, as the OpenFreeMap styles do.
const nameField = (separator) => [
  'case',
  ['has', 'name:nonlatin'],
  ['concat', ['get', 'name:latin'], separator, ['get', 'name:nonlatin']],
  ['coalesce', ['get', 'name_en'], ['get', 'name']],
]
const placeClass = (...classes) => ['in', ['get', 'class'], ['literal', classes]]
const isPoint = ['==', ['geometry-type'], 'Point']

export const FIRST_LABEL_LAYER = 'label-waterway'

// One set of label layers for every basemap. Later layers win when labels collide,
// so the list runs from least to most important. Colours stay neutral on purpose:
// red, green, blue, orange and yellow already carry damage status on this map.
function labelLayers(dark) {
  const ink = dark ? '#ffffff' : '#1f2933'
  const soft = dark ? '#d5d9de' : '#4b5563'
  const water = dark ? '#b9dcff' : '#1d5fa8'
  const halo = dark ? 'rgba(0, 0, 0, 0.85)' : 'rgba(255, 255, 255, 0.9)'
  const paint = (color, width = 1.4) => ({
    'text-color': color,
    'text-halo-color': halo,
    'text-halo-width': width,
  })
  const symbol = (id, sourceLayer, rest) => ({
    id,
    type: 'symbol',
    source: 'openmaptiles',
    'source-layer': sourceLayer,
    ...rest,
  })
  const place = (id, classes, minzoom, font, size, color = ink, extra = {}) =>
    symbol(id, 'place', {
      minzoom,
      filter: placeClass(...classes),
      layout: {
        'text-field': nameField('\n'),
        'text-font': [font],
        'text-size': size,
        'text-max-width': 8,
        ...extra.layout,
      },
      paint: paint(color),
      ...(extra.maxzoom ? { maxzoom: extra.maxzoom } : {}),
    })

  return [
    symbol(FIRST_LABEL_LAYER, 'waterway', {
      minzoom: 9,
      layout: {
        'symbol-placement': 'line',
        'text-field': nameField(' '),
        'text-font': ['Noto Sans Italic'],
        'text-size': 12,
      },
      paint: paint(water),
    }),
    symbol('label-water', 'water_name', {
      filter: isPoint,
      layout: { 'text-field': nameField('\n'), 'text-font': ['Noto Sans Italic'], 'text-size': 12 },
      paint: paint(water),
    }),
    symbol('label-road', 'transportation_name', {
      minzoom: 10,
      filter: placeClass('motorway', 'trunk', 'primary', 'secondary', 'tertiary'),
      layout: {
        'symbol-placement': 'line',
        'text-field': ['coalesce', ['get', 'name:latin'], ['get', 'name']],
        'text-font': ['Noto Sans Regular'],
        'text-size': 11,
      },
      paint: paint(soft, 1.2),
    }),
    // Services that matter in a response. The tiles only carry these from zoom 14.
    symbol('label-poi', 'poi', {
      minzoom: 14,
      filter: placeClass('hospital', 'police', 'fire_station', 'school', 'college', 'town_hall'),
      layout: {
        'text-field': nameField('\n'),
        'text-font': ['Noto Sans Regular'],
        'text-size': 11,
        'text-max-width': 8,
      },
      paint: paint(soft, 1.2),
    }),
    symbol('label-park', 'park', {
      minzoom: 8,
      filter: ['all', isPoint, ['has', 'name']],
      layout: {
        'text-field': nameField('\n'),
        'text-font': ['Noto Sans Italic'],
        'text-size': 12,
        'text-max-width': 8,
      },
      paint: paint(soft),
    }),
    symbol('label-peak', 'mountain_peak', {
      minzoom: 9,
      layout: {
        'text-field': [
          'case',
          ['has', 'ele'],
          ['concat', nameField(' '), '\n', ['to-string', ['get', 'ele']], ' m'],
          nameField(' '),
        ],
        'text-font': ['Noto Sans Italic'],
        'text-size': 11,
        'text-max-width': 8,
      },
      paint: paint(soft),
    }),
    place('label-hamlet', ['hamlet', 'suburb', 'quarter', 'neighbourhood', 'isolated_dwelling'], 11, 'Noto Sans Regular', 11, soft),
    place('label-village', ['village'], 9, 'Noto Sans Regular', 12),
    place('label-town', ['town'], 6, 'Noto Sans Bold', 13),
    place('label-city', ['city'], 4, 'Noto Sans Bold', 15),
    {
      id: 'label-district',
      type: 'symbol',
      source: 'districts',
      minzoom: 7,
      maxzoom: 12,
      layout: {
        'text-field': ['get', 'name'],
        'text-font': ['Noto Sans Bold'],
        'text-size': 12,
        'text-transform': 'uppercase',
        'text-letter-spacing': 0.12,
        'text-max-width': 8,
      },
      paint: paint(soft),
    },
    place('label-state', ['state', 'province'], 4, 'Noto Sans Bold', 13, soft, {
      maxzoom: 9,
      layout: { 'text-transform': 'uppercase', 'text-letter-spacing': 0.15 },
    }),
    place('label-country', ['country'], 0, 'Noto Sans Bold', 16, ink, { maxzoom: 7 }),
  ]
}

const LABEL_SOURCE_LAYERS = ['place', 'waterway', 'water_name', 'mountain_peak', 'transportation_name']

// Adds the shared label layers to a style, replacing any labels it came with.
function withLabels(style, dark) {
  const own = (layer) => layer.type === 'symbol' && LABEL_SOURCE_LAYERS.includes(layer['source-layer'])
  return {
    ...style,
    glyphs: GLYPHS,
    sources: { ...style.sources, openmaptiles: VECTOR_SOURCE, districts: DISTRICT_SOURCE },
    layers: [...style.layers.filter((layer) => !own(layer)), ...labelLayers(dark)],
  }
}

const rasterStyle = (id, tiles, attribution, maxzoom) =>
  withLabels(
    {
      version: 8,
      sources: { [id]: { type: 'raster', tiles: [tiles], tileSize: 256, attribution, maxzoom } },
      layers: [{ id, type: 'raster', source: id }],
    },
    true,
  )

// Built once: MapLibre reloads the whole style whenever it is handed a new object.
const SENTINEL_STYLE = rasterStyle(
  'sentinel2',
  'https://tiles.maps.eox.at/wmts/1.0.0/s2cloudless-2020_3857/default/g/{z}/{y}/{x}.jpg',
  '<a href="https://s2maps.eu">Sentinel-2 cloudless</a> by EOX (contains modified Copernicus Sentinel data 2020), CC BY-NC-SA 4.0',
  14,
)
const IMAGERY_STYLE = rasterStyle(
  'imagery',
  'https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}',
  'Imagery &copy; Esri, Maxar, Earthstar Geographics',
  18,
)

// Shown if the street style cannot be fetched: labels on a plain background.
const plainStyle = (dark) =>
  withLabels(
    {
      version: 8,
      sources: {},
      layers: [{ id: 'background', type: 'background', paint: { 'background-color': dark ? '#0c0c0c' : '#f8f4f0' } }],
    },
    dark,
  )

export const BASE_MAPS = {
  street: { label: 'Street map' },
  sentinel: { label: 'Sentinel-2 mosaic (10 m)' },
  imagery: { label: 'High-resolution imagery' },
}

// Imagery is dark regardless of the app theme.
export const isDarkBase = (baseMap, dark) => baseMap !== 'street' || dark

const streetStyles = new Map()

// Resolves to a complete MapLibre style for the chosen basemap and theme.
export async function loadMapStyle(baseMap, dark) {
  if (baseMap === 'sentinel') return SENTINEL_STYLE
  if (baseMap === 'imagery') return IMAGERY_STYLE

  // OpenFreeMap vector styles (OpenStreetMap data), with a dark variant.
  const key = dark ? 'dark' : 'liberty'
  if (!streetStyles.has(key)) {
    try {
      // A short deadline: this runs before the map can draw anything, and a host that never
      // answers would otherwise leave the "Loading map" spinner up for ever.
      const style = await fetchData(`${OPENFREEMAP}/styles/${key}`, { label: 'the street map style', timeout: 6_000, retries: 0 })
      streetStyles.set(key, withLabels(style, dark))
    } catch {
      return plainStyle(dark)
    }
  }
  return streetStyles.get(key)
}

// Open elevation tiles (Mapzen Terrarium on AWS) for the hillshade layer.
export const TERRAIN_SOURCE = {
  type: 'raster-dem',
  tiles: ['https://s3.amazonaws.com/elevation-tiles-prod/terrarium/{z}/{x}/{y}.png'],
  encoding: 'terrarium',
  tileSize: 256,
  maxzoom: 14,
  attribution: 'Elevation: <a href="https://github.com/tilezen/joerd/blob/master/docs/attribution.md">Mapzen Terrain Tiles</a>',
}
