// MapLibre zoom levels are one lower than Leaflet's for the same scale.
export const MAP_DEFAULTS = {
  center: { lat: 28.125, lng: 85.29 },
  zoom: 10,
  minZoom: 7,
  maxZoom: 17,
}

// [minLat, minLng, maxLat, maxLng] sent to the backend as the area of interest
export const EVENT_BBOX = [27.9, 85.1, 28.32, 85.45]

const OPENFREEMAP = 'https://tiles.openfreemap.org/styles'

const OPENFREEMAP_FONTS = 'https://tiles.openfreemap.org/fonts/{fontstack}/{range}.pbf'

// Latin name with the local-script name beneath it, as the OpenFreeMap styles do.
const labelText = (separator) => [
  'case',
  ['has', 'name:nonlatin'],
  ['concat', ['get', 'name:latin'], separator, ['get', 'name:nonlatin']],
  ['coalesce', ['get', 'name_en'], ['get', 'name']],
]
const LABEL_PAINT = {
  'text-color': '#ffffff',
  'text-halo-color': 'rgba(0, 0, 0, 0.85)',
  'text-halo-width': 1.4,
}

// Place, river and peak names drawn over imagery, which has no labels of its own.
const LABEL_LAYERS = [
  {
    id: 'label-waterway',
    type: 'symbol',
    source: 'openmaptiles',
    'source-layer': 'waterway',
    minzoom: 9,
    layout: {
      'symbol-placement': 'line',
      'text-field': labelText(' '),
      'text-font': ['Noto Sans Italic'],
      'text-size': 12,
    },
    paint: { ...LABEL_PAINT, 'text-color': '#cfe8ff' },
  },
  {
    id: 'label-peak',
    type: 'symbol',
    source: 'openmaptiles',
    'source-layer': 'mountain_peak',
    minzoom: 9,
    layout: {
      'text-field': labelText('\n'),
      'text-font': ['Noto Sans Italic'],
      'text-size': 11,
    },
    paint: LABEL_PAINT,
  },
  {
    id: 'label-place',
    type: 'symbol',
    source: 'openmaptiles',
    'source-layer': 'place',
    filter: [
      'all',
      ['in', ['get', 'class'], ['literal', ['city', 'town', 'village', 'hamlet', 'suburb']]],
      // Small places only once zoomed in to district level.
      ['any', ['in', ['get', 'class'], ['literal', ['city', 'town']]], ['>=', ['zoom'], 8]],
    ],
    layout: {
      'text-field': labelText('\n'),
      'text-font': ['Noto Sans Regular'],
      'text-size': ['match', ['get', 'class'], 'city', 15, 'town', 13, 12],
      'text-max-width': 8,
    },
    paint: LABEL_PAINT,
  },
]

const rasterStyle = (id, tiles, attribution, maxzoom) => ({
  version: 8,
  glyphs: OPENFREEMAP_FONTS,
  sources: {
    [id]: { type: 'raster', tiles: [tiles], tileSize: 256, attribution, maxzoom },
    openmaptiles: { type: 'vector', url: 'https://tiles.openfreemap.org/planet' },
  },
  layers: [{ id, type: 'raster', source: id }, ...LABEL_LAYERS],
})

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

export const BASE_MAPS = {
  street: {
    label: 'Street map',
    // OpenFreeMap vector tiles (OpenStreetMap data), with a dark variant.
    style: (dark) => `${OPENFREEMAP}/${dark ? 'dark' : 'liberty'}`,
  },
  sentinel: { label: 'Sentinel-2 mosaic (10 m)', style: () => SENTINEL_STYLE },
  imagery: { label: 'High-resolution imagery', style: () => IMAGERY_STYLE },
}

export const getMapStyle = (baseMap, dark) => (BASE_MAPS[baseMap] ?? BASE_MAPS.street).style(dark)

// Open elevation tiles (Mapzen Terrarium on AWS) for the hillshade layer.
export const TERRAIN_SOURCE = {
  type: 'raster-dem',
  tiles: ['https://s3.amazonaws.com/elevation-tiles-prod/terrarium/{z}/{x}/{y}.png'],
  encoding: 'terrarium',
  tileSize: 256,
  maxzoom: 14,
  attribution: 'Elevation: <a href="https://github.com/tilezen/joerd/blob/master/docs/attribution.md">Mapzen Terrain Tiles</a>',
}
