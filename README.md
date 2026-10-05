# TANGO — Flood Response System

A system for mapping flood damage from space for rescue teams: a Python pipeline that turns Sentinel-1 radar scenes, a DEM and pre-event OpenStreetMap into a flood map, a damage overlay and a list of cut-off settlements, and a React dashboard with a situation-report copilot in English and Nepali. Case study: the Trishuli flood, Nepal, August 2026.

This is an educational prototype, not an operational tool.

## Status

| Part | State |
| --- | --- |
| Dashboard and copilot | Working. Runs on bundled demo data by default, or on the output of a pipeline run. |
| Pre-event OpenStreetMap, DEM, damage overlay, cut-off analysis, flood-path trace | Run on real data for the Trishuli area. |
| Flood model | Trained on a sample of Kuro Siwo; results in [pipeline/MODEL.md](pipeline/MODEL.md). |
| Sentinel-1 download, calibration, terrain correction and flood mapping | **Run end to end on real scenes** for Trishuli (16 and 28 Aug 2026): 2.6 km² of flood zones, 23 of 149 settlements cut off. **Checked against Copernicus EMS (EMSR927):** precision 0.88 to 0.99, but only 4% to 35% of the reference area is found, so every figure is a lower bound. See [docs/report.md](docs/report.md), section 5. |
| Before/after pictures | Produced from the real scenes and shown in the dashboard. |
| Sentinel-2 optical evidence | Run on real scenes for both areas (31% and 55% clear on both sides of the event). As built it changes the flood classes very little; its valley-floor "uncertain" patches do match the reference, its hillside ones are mostly cloud and haze. See the report, section 5. |
| Other areas and dates | A second area south-west of the first (Bidur, Phosretar) ran with the same code and settings on a different orbit track: 6.0 km² of flood zones, precision 0.94 to 0.95 and recall 0.30 to 0.35 against EMSR927. No other event or date has been tried. |

What the system cannot do is listed in the app at `/about` (Method and limitations). The draft challenge report is [docs/report.md](docs/report.md), rendered to [docs/report.pdf](docs/report.pdf) by `docs/build_report.py`.

## Run the dashboard

```bash
npm install
npm run dev      # http://localhost:5173
npm run test     # 64 tests
npm run build
```

## Run the pipeline

Python 3.11 to 3.13 (the geospatial packages have no wheels for 3.14 yet). From the repository root, on Windows:

```bash
py -3.13 -m venv pipeline/.venv
pipeline/.venv/Scripts/python -m pip install -r pipeline/requirements.txt
pipeline/.venv/Scripts/python -m pytest pipeline/tests     # 64 tests
```

For GPU training install PyTorch from its own index first: `pip install torch --index-url https://download.pytorch.org/whl/cu124`.

A full run takes an area and a flood date, and `--publish` puts the result in the dashboard:

```bash
cd pipeline
.venv/Scripts/python run.py --bbox 85.1,27.9,85.5,28.3 --event 2026-08-26 --out out/trishuli --name "Trishuli corridor, Rasuwa" --publish
```

### Any area, any date

The system is built to be run on an area and date chosen on the day:

1. Pick the bounding box as `west,south,east,north` in degrees and the flood date.
2. Run the command above with them, a new `--out` folder and a `--name`. Without `--name` the area is named after its largest mapped settlement.
3. Reload the dashboard. The new area opens first, and the selector in the header switches between every published area.

Each published area lives in `public/data/<id>/` and is listed in `public/data/runs.json` (`publish.py`). The title, map view, statistics, before/after pictures, copilot answers, one-page situation report and flood-path terrain all follow the selected area. What stays tied to the Trishuli case study: the bundled demo data, six district labels on the map, and the wording of the Method and limitations page. `python publish.py <run folder> --name "..."` publishes a run made earlier.

A first run on a new area downloads its scenes, elevation and OpenStreetMap snapshot: about 4.5 minutes for the first area; the second needed a retry because the OpenStreetMap service timed out. A re-run reuses the rasters and takes about a minute. Only two areas, both on the Trishuli, have been run so far, so a different valley or date is untested.

It needs a free [Copernicus Data Space](https://dataspace.copernicus.eu) account. Set the S3 keys from its keys manager as `AWS_ACCESS_KEY_ID` and `AWS_SECRET_ACCESS_KEY` (only the needed window of each scene is read; on Windows, `pipeline/set_cdse_keys.ps1` prompts for them and stores them), or `CDSE_USER` and `CDSE_PASSWORD` (whole products are downloaded, about 1.3 GB each). Add `--model models/unet_kurosiwo.pt` to map water with the trained model instead of thresholds, and `--optical` to bring in Sentinel-2 where the sky was clear (S3 keys only).

| Step | File | What it does |
| --- | --- | --- |
| Scene pair | `fetch_s1.py` | Finds a before/after Sentinel-1 GRD pair on the same orbit track, 12 days apart, bracketing the event; prefers full coverage of the area, then the earliest image after the event |
| Scene access | `download.py` | Reads the scene window and annotation from the Copernicus Data Space |
| DEM | `fetch_dem.py` | Copernicus DEM GLO-30 from the AWS open-data bucket, converted to ellipsoid heights |
| Preprocessing | `preprocess_s1.py` | Calibration to sigma0, thermal-noise removal, Lee speckle filter, Range-Doppler terrain correction, layover and shadow masks |
| Valley floor | `terrain.py` | Ground within 30 m above and 600 m of a river (pre-event OSM, or DEM-derived channels): where a flood can be |
| Flood map | `segment.py`, `predict.py` | Change detection on valley floors (water, debris; strong change elsewhere is "uncertain"), or the U-Net for water with the same rule for debris |
| Optical | `fetch_s2.py` | Sentinel-2 clear-sky composites either side of the event; confirms radar detections and fills radar blind spots on valley floors. It never removes a radar detection. Composites are cached in the run's `rasters/` folder |
| Pictures | `quicklook.py` | Before/after PNGs for the dashboard's satellite viewer |
| OpenStreetMap | `fetch_osm.py` | Buildings, roads, bridges, health facilities and places as of 27 July 2026 |
| Damage | `damage.py`, `infrastructure.py` | Features inside water or debris zones; health facilities cut from the road network |
| Cut-off settlements | `cutoff.py` | Settlements that could reach a hospital by road before the event and no longer can |
| Flood path (bonus) | `floodpath.py` | Drainage path from any point on the DEM and the settlements along it; `--export-dem` writes the DEM the dashboard traces on |
| Publishing | `publish.py` | Copies a run's dashboard files to `public/data/<id>/` and lists it in `runs.json` for the dashboard's area selector |
| Validation | `validate.py` | Compares a run with extracted Copernicus EMS products, per reference area: flood extent (IoU, precision, recall), buildings, roads and bridges. For checking only: `python validate.py out/trishuli cache/reference_emsr927` |
| Export | `export.py` | The files the dashboard reads |
| Model | `fetch_kurosiwo.py`, `unet.py`, `train_model.py`, `evaluate_model.py` | Dataset sample, network, training and evaluation |

The flood-path trace runs without any account:

```bash
.venv/Scripts/python floodpath.py --point 85.378,28.277 --bbox 85.1,27.9,85.5,28.3 --out out
```

### Data rules

Inputs are Sentinel-1, Copernicus DEM, OpenStreetMap as it was before the event, and Kuro Siwo for training. Published damage maps (Copernicus EMS, UNOSAT) and post-event OpenStreetMap edits are not used as inputs; `fetch_osm.py` refuses a snapshot date on or after the event.

The ohsome API, which the challenge names for the OpenStreetMap snapshot, answered HTTP 403 on its geometry endpoints when this was built. The pipeline asks ohsome first and falls back to the Overpass API with the same snapshot date; `satellite.json` records which service supplied the data.

### Attribution

Contains modified Copernicus Sentinel data 2026. Produced using Copernicus WorldDEM-30 © DLR e.V. 2010–2014 and © Airbus Defence and Space GmbH 2014–2018 provided under COPERNICUS by the European Union and ESA; all rights reserved. © OpenStreetMap contributors (ODbL). Flood model trained on Kuro Siwo (Bountos et al., NeurIPS 2024), CC BY 4.0; full citation in [pipeline/MODEL.md](pipeline/MODEL.md).

## Splash screen

The app opens on a TANGO splash screen once per browser session: the title, a three-line checklist and a launch button. Each checklist line is ticked when its data has actually arrived (`DATA_PARTS` in `src/hooks/useDamageData.js`), not on a timer, and **Launch monitoring** appears when everything has loaded. The language chosen there is the copilot's language; the dashboard itself is in English.

Behind the text is a space scene (`src/components/Splash/SpaceScene.jsx`) built from NASA material:

| Part | What it is | Source |
| --- | --- | --- |
| Stars | Tycho star map, `public/images/starmap.webp` | [nasa/NASA-3D-Resources](https://github.com/nasa/NASA-3D-Resources) |
| Satellite | Jason-1 3D model (gold body, two solar wings), `public/models/jason1.glb`, rendered live with three.js (`SatelliteModel.jsx`) | same repository |
| Earth | Blue Marble imagery on MapLibre's globe projection (`SplashGlobe.jsx`); it turns until India faces the viewer, then drifts slowly | NASA GIBS tiles |

NASA states these assets are free and without copyright. The model is Draco-compressed, so the decoder files in `public/draco/` (copied from three.js) must ship with it. Jason-1, a radar altimeter satellite, stands in for the Sentinel-1 radar satellite the data comes from, for which NASA has no model.

The scene loads after the text and costs about 1.4 MB (star map, model, decoder) plus three.js. On slow or data-saving connections and on devices without WebGL2 only the star map is shown; with reduced motion nothing moves.

## Data sources for the dashboard

To show the output of a pipeline run, write it into `public/data/` and point the app at it:

```bash
pipeline/.venv/Scripts/python pipeline/run.py --bbox 85.1,27.9,85.5,28.3 --event 2026-08-26 --out public/data
echo VITE_DATA_URL=/data > .env.local
npm run dev
```

`public/data/` is git-ignored. In this mode the Demo data badge disappears and the dashboard states what the data does not contain instead of filling gaps:

- A settlement with no road in the pre-event map is shown as "Access unknown", not as cut off.
- OpenStreetMap records a population for very few settlements here (1 of 149 in the Trishuli area), so settlement size is given in mapped buildings and no head count is shown.
- Roads and bridges inside a flood zone are labelled "in flood zone", not "destroyed". Power lines are not assessed.

`pipeline/dev_fixture.py` writes a real-scale dataset with a made-up flood (a buffer around the traced river path) for testing the dashboard before a real run. Its output is labelled synthetic and is not a flood map.

With neither a data folder nor a backend configured the app runs on the bundled dataset in `src/data` and shows a **Demo data** badge. Everything in that dataset is illustrative: geometry is generated around approximate settlement locations, and the before/after images are drawn placeholders, not Sentinel-1 scenes.

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

## Flood path

The **Flood path** button on the map traces, from any point you tap, where water would run: it expands outward over the DEM always taking the lowest cell on the frontier, so it follows the valley floor and climbs out of pits. The settlements within 500 m of the path are listed in downstream order. The trace runs in the browser (`src/utils/floodPath.js`) on a 30 m Copernicus DEM, about 3.6 MB, fetched the first time the tool is used: `public/terrain/` for the Trishuli area, or `dem.bin` in the data folder of a pipeline run. It is a drainage line, not a flood model: it gives direction, not depth, width, timing or reach.

For another area, write the DEM with `python pipeline/floodpath.py --export-dem --bbox W,S,E,N --out public/terrain`.

## Rescue priority

Cut-off settlements are ranked by a 0-100 score (`calculateRescuePriority` in `src/utils/calculations.js`):

| Factor | Weight | Source |
| --- | --- | --- |
| Population (saturates at 2,000) | 35% | settlement data |
| Share of structures damaged | 25% | building footprints |
| Access difficulty, 1 (vehicle track) to 5 (helicopter only) | 20% | `access_difficulty`, field report |
| Critical infrastructure: health post unreachable 50, bridge destroyed 30, water supply cut 20 | 15% | infrastructure layer via `settlement_id`; `water_source_cut`, field report |
| Children and elderly as a share of residents | 5% | `children`, `elderly`, field report |

Bands: above 80 critical, above 60 high, above 40 medium, otherwise low. The field-report inputs cannot be seen from satellite. In the demo dataset they are illustrative.

Nothing is assumed for a missing input. Only factors recorded for every cut-off settlement are scored, and their weights are rescaled to add up to 100%, so that a gap in the data cannot lift one settlement above another. Where population is missing, settlement size is taken from mapped buildings (saturating at 400) with the population weight. On a pipeline run this usually leaves building count, share of buildings in the flood zone and critical infrastructure; the note under the ranking lists what was scored.

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
  pages/        DashboardPage, CopilotPage, AboutPage, ErrorPage
  components/   Dashboard, Map, Tools, Copilot, Common, Layout, Splash
  store/        Zustand stores: map, data, copilot, ui
  services/     pipeline files, API or demo data; exports
  hooks/        useDamageData, useCopilot
  utils/        calculations, formatters, constants, wording
  data/         demo dataset and copilot templates
  config/       data mode and endpoints, map settings
pipeline/       Python pipeline, model, tests (see above)
  results/      model evaluation and training log
docs/           map library research
```

## Not built yet

- Anything that raises recall. The EMSR927 comparison shows the map misses most of the debris corridor, because most of it changes by less than 3 dB in the radar pair. Optical change on valley floors would roughly double recall where the sky is clear, but it is still only marked "uncertain": no rule or threshold has been chosen or tuned on the reference.
- A scene-pair rule that accepts an almost complete image. For the second area it chose an image ten days after the flood over one two days after that covers 99% of the area.
- A run on any area or date other than the Trishuli case study.
- A language model behind the copilot: answers are templates filled from the computed figures.
- Drawing/annotation tool, timeline animation, Shapefile export, live polling, offline tiles / PWA, deployment. The one-page situation report (`/report`) is saved as PDF through the browser print dialog.
