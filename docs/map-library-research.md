# Map library evaluation

Branch `feature/new-map-library` replaces Leaflet with MapLibre GL JS. This document records what was compared, what was measured, and where the result falls short of the targets set for the work.

## Summary

MapLibre GL JS is the right choice **if** the project needs a themed vector basemap, terrain shading and room for much larger datasets. It is **not** a performance fix for the current dashboard: Leaflet already redraws the full dataset in about 3 ms, and MapLibre adds roughly 400 KB (gzip) of JavaScript. Merge on the strength of the new capabilities, not on speed.

Result against the stated success criteria:

| Criterion | Result |
| --- | --- |
| Flood zones render 30% faster | Redraw CPU time fell from 2.9 ms to 1.2 ms, but both are far below one 16.7 ms frame, so there is no visible difference at this data size |
| Satellite imagery loads in under 2 s | Not established. No 4–5 s baseline was observed; the map was ready in 0.9 s (Leaflet) and 1.4 s (MapLibre) on the development machine |
| All existing features work | Yes: filters, layer toggles, popups, coordinates, measurement, full screen |
| Dark mode renders correctly | Yes, and the street basemap now has a real dark style |
| Bundle grows by no more than 50 KB | **No.** Total JavaScript grew by about 399 KB gzip. No WebGL map library fits in 50 KB |
| 60 FPS on a phone | Not tested. Needs a real device |
| README updated, tests pass | Yes |

Figures are in [map-benchmark.csv](map-benchmark.csv); method and limits are described below.

## Candidates

Repository data from the GitHub API on 2 Oct 2026.

| Library | Stars | Last push | Licence | Rendering | React wrapper | Verdict |
| --- | --- | --- | --- | --- | --- | --- |
| MapLibre GL JS | 11.8k | 2 Oct 2026 | BSD-3-Clause | WebGL, vector and raster | `react-map-gl` (8.5k stars) | **Chosen** |
| deck.gl | 14.6k | 2 Oct 2026 | MIT | WebGL data layers | built in | Overkill; still needs a basemap library underneath |
| OpenLayers | 12.6k | 2 Oct 2026 | BSD-2-Clause | Canvas and WebGL | none maintained | Capable, but no good React binding and a larger rewrite |
| Leaflet (current) | 45.7k | 2 Oct 2026 | BSD-2-Clause | DOM and Canvas | `react-leaflet` (last push Dec 2025) | Fast enough today; no vector basemap or hillshade without plugins |
| Mapbox GL JS | 12.4k | 2 Oct 2026 | Proprietary since v2 | WebGL | `react-map-gl` | Rejected: needs a paid access token, not open source |
| CesiumJS | 15.8k | 2 Oct 2026 | Apache-2.0 | 3D globe | `resium` | Rejected: very large, 3D is not needed |

Corrections to the brief this work started from:

- Mapbox GL JS has no maintained open-source build. Version 1 was the last open release; MapLibre is its continuation.
- MapLibre is not smaller than Leaflet. Leaflet plus react-leaflet came to about 50 KB gzip here; MapLibre and its worker come to about 450 KB.
- `leaflet-providers` is a list of tile URLs, not a performance improvement, and the `ESA/Sentinel-2-download-30m` repository does not exist.
- `@maplibre/maplibre-gl-directions` is a routing plugin, not a measurement tool. Measurement still uses Turf.js.
- Switching library does not make tiles arrive faster on a slow network. That depends on the tile source and on caching.

## What the switch delivers

- **Dark basemap.** OpenFreeMap vector styles (`liberty` and `dark`) follow the app theme. With Leaflet the basemap stayed light.
- **Terrain shading.** A hillshade layer from open elevation tiles replaces the OpenTopoMap raster overlay.
- **Sentinel-2 basemap.** EOX Sentinel-2 cloudless 2020 mosaic at 10 m, alongside the existing high-resolution imagery.
- **Filters without rebuilding layers.** Confidence, type and size filters are layer expressions; previously the GeoJSON layer was torn down and recreated on every change.
- **Stable draw order.** Layers stay mounted and are hidden by visibility, so toggling no longer reorders them.
- **Headroom.** WebGL rendering keeps redraw cost roughly flat as feature counts grow; Leaflet's canvas cost rises with every polygon.

## What it costs

- **About 399 KB more JavaScript (gzip).** The map chunk is loaded lazily, after the statistics are on screen, so the first view of the figures is not delayed.
- **Slower first map display.** Median 1.35 s against 0.88 s on the development machine, because the library is larger and loads after the page.
- **WebGL is required.** Old or locked-down field devices without WebGL will show no map. Leaflet had no such requirement.
- **Dependence on free tile services.** OpenFreeMap, EOX and the AWS elevation tiles are free and need no key, but carry no service guarantee. For field deployment they should be self-hosted or cached (PMTiles is the usual route).
- **Licences.** The EOX mosaic is CC BY-NC-SA 4.0 (non-commercial). Esri World Imagery is free to display with attribution but is not open data.

## Method and limits

- Measured in the Claude desktop browser pane on a Windows laptop against the Vite dev server, viewport 1280 × 800, default map view, demo dataset (14 flood zones, 3,150 building footprints, 9 road sections, 10 settlements).
- **Redraw time** is the main-thread time for one forced full redraw, median of 50. For MapLibre this excludes GPU time; adding `gl.finish()` gave 0.9 ms.
- **Ready time** is from navigation start to all visible tiles loaded and overlays drawn, three reloads each, with a warm HTTP cache.
- **Frame rate was not measured.** The browser pane does not run animation frames while it is not displayed. The MapLibre measurements used a timer in place of `requestAnimationFrame` for the same reason.
- **Tile payload** is the compressed size of the tiles covering the default view, fetched once with a script.
- Nothing was tested on a phone or on a slow connection.

To repeat the measurements, run `npm run dev`, open the dashboard, and use `window.__floodMap` (the MapLibre map, exposed in development only) from the browser console.
