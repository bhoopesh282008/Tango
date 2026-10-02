# Migrating the map from Leaflet to MapLibre GL JS

What changed on `feature/new-map-library`, for anyone maintaining the map code or pointing a backend at it.

## Dependencies

| Removed | Added |
| --- | --- |
| `leaflet`, `react-leaflet` | `maplibre-gl` 6, `react-map-gl` 8 (imported from `react-map-gl/maplibre`) |

MapLibre 6 ships its web worker as a separate ES module. Vite does not find it automatically, so `FloodMap.jsx` imports it with `?worker&url` and passes it to `setWorkerUrl`, and `vite.config.js` sets `worker.format` to `'es'`. Without this the map stays blank with "Worker failed to load" in the console.

## Breaking changes

- **Zoom levels are one lower.** MapLibre zoom 10 shows what Leaflet zoom 11 showed. `MAP_DEFAULTS` and the `zoom` value in the map store use MapLibre levels.
- **Base map ids changed.** `osm` and `satellite` became `street`, `sentinel` and `imagery`. `BASE_MAPS[id].style(dark)` returns a MapLibre style (a URL or a style object) instead of a tile URL.
- **WebGL is required.** There is no fallback renderer.
- **`ELEVATION_LAYER` is gone.** Terrain is now `TERRAIN_SOURCE`, a raster-dem source drawn as a hillshade layer. The layer id in the store is still `elevation`.
- **Popups are React components.** `Map/popup.js` and its HTML escaping were removed; popup text is built in `describeFeature` in `FloodMap.jsx`.

Data shapes, stores, hooks, services and every component outside `Map/` and `Tools/MeasurementTool.jsx` are unchanged.

## Component changes

| File | Before | After |
| --- | --- | --- |
| `Map/FloodMap.jsx` | `MapContainer`, `TileLayer`, `GeoJSON` | `Map` with `Source` and `Layer`; one click handler for all layers |
| `Map/DamageOverlay.jsx` | Filtered the features, remounted the layer | Fill and outline layers with a filter expression |
| `Map/MapMarkers.jsx` | `CircleMarker` and `divIcon` markers | Settlements as a circle layer; infrastructure as DOM `Marker`s |
| `Tools/MeasurementTool.jsx` | `Polyline`, `Polygon`, `CircleMarker` | One GeoJSON source with fill, line and circle layers |
| `Map/LayerControl.jsx` | unchanged | unchanged (reads the new `BASE_MAPS`) |
| `Tools/FilterControls.jsx` | unchanged | unchanged |
| `utils/calculations.js` | `filterZones` | adds `zoneFilterExpression`, the same rules as a layer filter |

## How things map across

| Leaflet | MapLibre |
| --- | --- |
| `<GeoJSON data style>` | `<Source type="geojson">` with one `<Layer>` per geometry style |
| `style={(feature) => ...}` | paint properties with expressions, for example `['case', ['==', ['get', 'damaged'], true], red, grey]` |
| Mount or unmount to show and hide | `layout={{ visibility }}`; keep layers mounted so the draw order is stable |
| `layer.bindPopup(html)` | `interactiveLayerIds` plus `onClick`, then a `<Popup>` |
| `[lat, lng]` | `[lng, lat]` everywhere |
| `map.invalidateSize()` | `map.resize()` |
| `preferCanvas` | not needed |

## Adding a layer

1. Add a `<Source>` and `<Layer>` in `FloodMap.jsx`, placed where it should sit in the draw order.
2. Give it `layout={visibility(visibleLayers.yourLayer)}` and add the id to `MAP_LAYERS` in `utils/constants.js` and to `visibleLayers` in `store/mapStore.js`.
3. If it should be clickable, add its id to `CLICKABLE_LAYERS` and a case to `describeFeature`.

## Going back

`main` still has the Leaflet implementation. Nothing outside the files listed above depends on the map library.
