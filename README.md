# TANGO — Flood Response System

Flood segmentation dashboard and situation-report copilot for rescue teams (Trishuli flood, Nepal, August 2026).

## Run

```bash
npm install
npm run dev      # http://localhost:5173
npm run test
npm run build
```

## Splash screen

The app opens on a TANGO splash screen once per browser session: the title, a three-line checklist and a launch button. Each checklist line is ticked when its data has actually arrived (`DATA_PARTS` in `src/hooks/useDamageData.js`), not on a timer, and **Launch monitoring** appears when everything has loaded. The language chosen there is the copilot's language; the dashboard itself is in English.

Background footage is optional. Put these in `public/videos/` and the splash plays the clip behind the text, darkened for contrast:

| File | Notes |
| --- | --- |
| `tango-splash.webm` | VP9, 1920×1080 or smaller, 5–8 s loop, no audio, 2–5 MB |
| `tango-splash.mp4` | H.264 copy of the same clip |
| `splash-poster.jpg` | One frame of the clip, shown while it loads |

Without the files the splash keeps a plain dark background. The clip is not played on slow or data-saving connections or when reduced motion is requested; the poster is shown instead.

## Demo data vs. backend

With no backend configured the app runs on the bundled dataset in `src/data` and shows a **Demo data** badge. Everything in that dataset is illustrative: geometry is generated around approximate settlement locations, and the before/after images are drawn placeholders, not Sentinel-1 scenes.

To use a real backend, copy `.env.example` to `.env.local` and set `VITE_API_BASE_URL`. The services in `src/services` then call:

| Endpoint | Used for | Expected shape |
| --- | --- | --- |
| `GET /satellite/before`, `/satellite/after` | Comparison slider | `{ url, date, sensor, resolution }` |
| `GET /damage-analysis?bbox=` | Flood zones | `{ geojson }`, polygons with `id, name, type, confidence, area_km2` |
| `GET /buildings?bbox=` | Building footprints | GeoJSON with `settlement_id, damaged` |
| `GET /roads?bbox=` | Road sections | GeoJSON with `id, name, damaged, length_km` |
| `GET /settlements` | Settlement markers, list and priority ranking | `[{ id, name, name_np, lat, lng, population, connected, access_difficulty, water_source_cut, children, elderly }]` |
| `GET /infrastructure` | Bridges, health posts, power lines | `[{ id, settlement_id?, type, name, lat, lng, status, length_km? }]` |
| `POST /copilot/ask` | Copilot answers | `{ answer, confidence, dataSource }` |

`type` is `water`, `debris` or `uncertain`. Infrastructure `status` is `operational` or anything else (treated as damaged).

## Rescue priority

Cut-off settlements are ranked by a 0-100 score (`calculateRescuePriority` in `src/utils/calculations.js`):

| Factor | Weight | Source |
| --- | --- | --- |
| Population (saturates at 2,000) | 35% | settlement data |
| Share of structures damaged | 25% | building footprints |
| Access difficulty, 1 (vehicle track) to 5 (helicopter only) | 20% | `access_difficulty`, field report |
| Critical infrastructure: health post unreachable 50, bridge destroyed 30, water supply cut 20 | 15% | infrastructure layer via `settlement_id`; `water_source_cut`, field report |
| Children and elderly as a share of residents | 5% | `children`, `elderly`, field report |

Bands: above 80 critical, above 60 high, above 40 medium, otherwise low. The field-report inputs cannot be seen from satellite; missing values count as the lowest level. In the demo dataset they are illustrative.

## Map

The map uses MapLibre GL JS through `react-map-gl/maplibre` and needs WebGL. All tile sources are free and need no API key:

| Layer | Source |
| --- | --- |
| Street map (light and dark) | OpenFreeMap vector tiles, OpenStreetMap data |
| Sentinel-2 mosaic | EOX Sentinel-2 cloudless 2020 (CC BY-NC-SA 4.0) |
| High-resolution imagery | Esri World Imagery |
| Terrain shading | Mapzen Terrarium elevation tiles on AWS |

Labels are the same on every basemap: countries, provinces, cities, towns, villages, hamlets, rivers, peaks, parks, main roads and (from zoom 14) hospitals, schools, police and fire stations, all from the OpenFreeMap tiles and defined in `labelLayers()` in `src/config/mapConfig.js`. Those tiles carry no district names, so six districts around the corridor are labelled from a short list in the same file, at approximate positions. Settlement names come from the app's own data. Flood zones, buildings and roads are drawn beneath the labels.

These are public services with no guarantee of availability. Before field use, host or cache the tiles you rely on. Sources and default view are set in `src/config/mapConfig.js`.

Background on the library choice is in [docs/map-library-research.md](docs/map-library-research.md), with figures in [docs/map-benchmark.csv](docs/map-benchmark.csv) and a guide to the code changes in [docs/map-migration.md](docs/map-migration.md).

## How the numbers stay consistent

`src/utils/calculations.js` derives every statistic from the loaded layers (`computeStats`). The stat cards, analysis cards, exports and copilot answers all read from that one result. In demo mode the copilot fills the templates in `src/data/copilotTemplates.js` with those figures; it does not generate free text.

The copilot page is a conversation: preset questions, or a typed question. In demo mode there is no language model behind it. A typed question is matched by keyword to one of the four topics (`matchQuestion` in `src/services/copilotService.js`), and anything else gets a notice saying it cannot be answered. With a backend configured, typed questions are sent to `POST /copilot/ask` as written.

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
