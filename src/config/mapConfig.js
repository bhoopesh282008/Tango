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

const rasterStyle = (id, tiles, attribution, maxzoom) => ({
  version: 8,
  sources: { [id]: { type: 'raster', tiles: [tiles], tileSize: 256, attribution, maxzoom } },
  layers: [{ id, type: 'raster', source: id }],
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
