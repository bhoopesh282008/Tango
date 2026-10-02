# Trishuli Flood Response Dashboard

Flood segmentation dashboard and situation-report copilot for rescue teams (Trishuli flood, Nepal, August 2026).

## Run

```bash
npm install
npm run dev      # http://localhost:5173
npm run test
npm run build
```

## Demo data vs. backend

With no backend configured the app runs on the bundled dataset in `src/data` and shows a **Demo data** badge. Everything in that dataset is illustrative: geometry is generated around approximate settlement locations, and the before/after images are drawn placeholders, not Sentinel-1 scenes.

To use a real backend, copy `.env.example` to `.env.local` and set `VITE_API_BASE_URL`. The services in `src/services` then call:

| Endpoint | Used for | Expected shape |
| --- | --- | --- |
| `GET /satellite/before`, `/satellite/after` | Comparison slider | `{ url, date, sensor, resolution }` |
| `GET /damage-analysis?bbox=` | Flood zones | `{ geojson }`, polygons with `id, name, type, confidence, area_km2` |
| `GET /buildings?bbox=` | Building footprints | GeoJSON with `settlement_id, damaged` |
| `GET /roads?bbox=` | Road sections | GeoJSON with `id, name, damaged, length_km` |
| `GET /settlements` | Settlement markers and list | `[{ id, name, name_np, lat, lng, population, connected }]` |
| `GET /infrastructure` | Bridges, health posts, power lines | `[{ id, type, name, lat, lng, status, length_km? }]` |
| `POST /copilot/ask` | Copilot answers | `{ answer, confidence, dataSource }` |

`type` is `water`, `debris` or `uncertain`. Infrastructure `status` is `operational` or anything else (treated as damaged).

## Map

The map uses MapLibre GL JS through `react-map-gl/maplibre` and needs WebGL. All tile sources are free and need no API key:

| Layer | Source |
| --- | --- |
| Street map (light and dark) | OpenFreeMap vector tiles, OpenStreetMap data |
| Sentinel-2 mosaic | EOX Sentinel-2 cloudless 2020 (CC BY-NC-SA 4.0) |
| High-resolution imagery | Esri World Imagery |
| Terrain shading | Mapzen Terrarium elevation tiles on AWS |

These are public services with no guarantee of availability. Before field use, host or cache the tiles you rely on. Sources and default view are set in `src/config/mapConfig.js`.

Background on the library choice is in [docs/map-library-research.md](docs/map-library-research.md), with figures in [docs/map-benchmark.csv](docs/map-benchmark.csv) and a guide to the code changes in [docs/map-migration.md](docs/map-migration.md).

## How the numbers stay consistent

`src/utils/calculations.js` derives every statistic from the loaded layers (`computeStats`). The stat cards, analysis cards, exports and copilot answers all read from that one result. In demo mode the copilot fills the templates in `src/data/copilotTemplates.js` with those figures; it does not generate free text.

The Nepali templates have not been reviewed by a native speaker.

## Layout

```
src/
  pages/        DashboardPage, CopilotPage, ErrorPage
  components/   Dashboard, Map, Tools, Copilot, Common, Layout
  store/        Zustand stores: map, data, copilot, ui
  services/     API access with demo-data fallback, exports
  hooks/        useDamageData, useCopilot
  utils/        calculations, formatters, constants
  data/         demo dataset and copilot templates
  config/       API endpoints, map settings
```

## Not built yet

Drawing/annotation tool, timeline animation, Shapefile export, live polling, offline tiles / PWA, EMSR927 accuracy validation, deployment. PDF export uses the browser print dialog.
