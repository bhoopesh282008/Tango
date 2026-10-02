export const MAP_DEFAULTS = {
  center: { lat: 28.125, lng: 85.29 },
  zoom: 11,
  minZoom: 8,
  maxZoom: 18,
}

// [minLat, minLng, maxLat, maxLng] sent to the backend as the area of interest
export const EVENT_BBOX = [27.9, 85.1, 28.32, 85.45]

export const BASE_MAPS = {
  osm: {
    label: 'Street map',
    url: 'https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png',
    attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors',
    maxZoom: 19,
  },
  satellite: {
    label: 'Satellite',
    url: 'https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}',
    attribution: 'Imagery &copy; Esri, Maxar, Earthstar Geographics',
    maxZoom: 18,
  },
}

export const ELEVATION_LAYER = {
  url: 'https://{s}.tile.opentopomap.org/{z}/{x}/{y}.png',
  attribution: 'Contours &copy; <a href="https://opentopomap.org">OpenTopoMap</a> (CC-BY-SA)',
  maxZoom: 17,
  opacity: 0.45,
}
