# TANGO — Flood Response System

A system for mapping flood damage from space for rescue teams: a Python pipeline that turns Sentinel-1 radar scenes, a DEM and pre-event OpenStreetMap into a flood map, a damage overlay and a list of cut-off settlements, and a React dashboard with a situation-report copilot in English and Nepali. Case study: the Trishuli flood, Nepal, August 2026.

This is an educational prototype, not an operational tool.

## Status

| Part | State |
| --- | --- |
| Dashboard and copilot | Working. Runs on bundled demo data by default, or on the output of a pipeline run. |
| Pre-event OpenStreetMap, DEM, damage overlay, cut-off analysis, flood-path trace | Run on real data for the Trishuli area. |
| Flood model | Trained on a sample of Kuro Siwo; results in [pipeline/MODEL.md](pipeline/MODEL.md). |
| Sentinel-1 download, calibration, terrain correction and flood mapping | **Run end to end on real scenes** for Trishuli (16 and 28 Aug 2026): 2.07 km² of flood zones, 11 of 149 settlements cut off. **Checked against Copernicus EMS (EMSR927):** precision 0.88 to 0.99, but only 3% to 35% of the reference area is found, so every figure is a lower bound. See [docs/report.md](docs/report.md), section 5. |
| The rule's false alarms | Run on two images that are both from before the event, the default rule (median of three images, a change must beat the ground's normal variation) marks 9% to 13% of its own mapped area; the single-image rule marked 24% to 127% (`pipeline/null_test.py`). Part of every map is ordinary change, not the flood. |
| Before/after pictures | Produced from the real scenes and shown in the dashboard. |
| Sentinel-2 optical evidence | Run on real scenes for both areas (31% and 55% clear on both sides of the event). As built it changes the flood classes very little; its valley-floor "uncertain" patches do match the reference, its hillside ones are mostly cloud and haze. See the report, section 5. |
| Other areas and dates | A second area south-west of the first (Bidur, Phosretar), on the same scene pair: 4.7 km² of flood zones, 14 of 116 settlements cut off, precision 0.94 to 0.97 and recall 0.22 to 0.35 against EMSR927. A new valley (Bhote Koshi), a dry-season date on it and the 2021 Chamoli glacier flood in Uttarakhand were run as rehearsals. On Bhote Koshi the default rule maps the real event at 3.3 times the area of the dry-season date (the single-image rule could not tell them apart). The 2021 Chamoli glacier flood (Uttarakhand) straddles two image frames: the first run read one, so the radar covered 84% of the area and no baseline could be built; with the frames joined it covers 100%, the pair is track 56 three days after the event, and the default rule maps 0.22 km² of water and debris (plus 0.22 km² uncertain), no settlement cut off (30 of 61 have no mapped road). Not checked against any reference map: it shows the system runs on a new event, not how well it maps it. |

What the system cannot do is listed in the app at `/about` (Method and limitations). The draft challenge report is [docs/report.md](docs/report.md), rendered to [docs/report.pdf](docs/report.pdf) by `docs/build_report.py`.

## Run the dashboard

```bash
npm install
npm run dev      # http://localhost:5173
npm run test     # 217 tests
npm run lint
npm run build
```

A fresh clone has no run data (`public/data` is not in git), so the dashboard opens on the bundled demo dataset with a "Demo data" badge; run the pipeline (below) to see a real area. The first page load of the dev server takes about 20 seconds while it prepares its dependencies. Tested on a clean clone: `npm install`, `npm run test`, `npm run lint`, `npm run build`, then a Python 3.13 environment, `pip install -r pipeline/requirements.txt` (about four minutes, PyTorch included) and `pytest pipeline/tests` all pass. `npm install` reports advisories in development tools and in `react-router` server-side rendering, which this static app does not use.

`npm run test:a11y` runs axe-core accessibility checks in a browser; it needs `@playwright/test`, `@axe-core/playwright` and Chromium (`npm i -D @playwright/test @axe-core/playwright`, then `npx playwright install chromium`).

## Deploy (GitHub Pages)

The dashboard is a static site. The run data it shows (`public/data`, tens of megabytes) is not in git, so a build made from git has no data. The deploy script builds here, where the data is:

```bash
npm run deploy:pages            # build for the repository's Pages address and check it; pushes nothing
npm run deploy:pages -- --push  # publish to the gh-pages branch
```

It works out the address and base path from the git remote (`https://<owner>.github.io/<repo>/`), refuses to continue if a published run is missing a file, builds with that base path, adds `404.html` (so a refresh on `/Tango/copilot` still loads the app) and `.nojekyll`, and with `--push` force-pushes the finished folder as a single commit on `gh-pages`. That keeps the data out of the history of `main` and stops `gh-pages` accumulating copies of it. Once, in the repository's Settings, Pages, set the source to the `gh-pages` branch.

GitHub Pages cannot send response headers, so the Content-Security-Policy is a `<meta>` tag in the built page (`scripts/csp.mjs`; it lists the few map and imagery hosts the app uses). Continuous integration (`.github/workflows/ci.yml`) runs lint, the tests and a build at the Pages path; it does not deploy. Build for another path with `VITE_BASE=/other/ npm run build` (in Git Bash on Windows prefix the command with `MSYS_NO_PATHCONV=1`).

Each page shows its build (version, commit, date) in the footer, so what was seen can be tied to a commit.

## Run the pipeline

Python 3.11 to 3.13 (the geospatial packages have no wheels for 3.14 yet). From the repository root, on Windows:

```bash
py -3.13 -m venv pipeline/.venv
pipeline/.venv/Scripts/python -m pip install -r pipeline/requirements.txt
pipeline/.venv/Scripts/python -m pytest pipeline/tests     # 191 tests
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

A first run on a new area downloads its scenes, elevation and OpenStreetMap snapshot: 3 to 6 minutes once OpenStreetMap answers, and up to 16 when the free service is busy (the pipeline waits and retries, and stops with a message after about seven minutes; run the same command again to continue from the cache). A re-run reuses the rasters and takes under a minute. Rehearsals so far: Trishuli, a second Trishuli reach, the Bhote Koshi valley, a dry-season date on it, and the Chamoli glacier flood of 2021.

By default the flood map compares with the median of three images on the same track (the "before" scene and the two 12 days earlier), counting a change only if it also exceeds the normal variation of that ground; `--baseline-images 1` gives the single "before" image. With given rasters (`--pre`, `--post`) or a model it is one image. `--context` adds modelled population (WorldPop) and river flow (GloFAS) beside the map; it is off by default because these are not among the inputs the challenge lists, and nothing in the results reads them (`publish.py --with-context` publishes the file).

It needs a free [Copernicus Data Space](https://dataspace.copernicus.eu) account. Set the S3 keys from its keys manager as `AWS_ACCESS_KEY_ID` and `AWS_SECRET_ACCESS_KEY` (only the needed window of each scene is read; on Windows, `pipeline/set_cdse_keys.ps1` prompts for them and stores them), or `CDSE_USER` and `CDSE_PASSWORD` (whole products are downloaded, about 1.3 GB each). Add `--model models/unet_kurosiwo.pt` to map water with the trained model instead of thresholds, and `--optical` to bring in Sentinel-2 where the sky was clear (S3 keys only).

### On the day: running a new area

```bash
cd pipeline
.venv/Scripts/python run.py --bbox <west,south,east,north> --event <YYYY-MM-DD> --out out/<folder> --name "<area name>" --publish
```

Add `--optical` for the full run with Sentinel-2 where the sky was clear (about 17 minutes more per area; only 30% to 55% of the Trishuli areas had a clear view on both sides of the event, and it changed the flood classes very little, section 5 of the report).

The run first checks the area, the date, the credentials and the output folder, and reports every problem at once before anything is downloaded. It then prints numbered steps with the time; reading the two Sentinel-1 scenes is the slow one. `--search-days N` widens the search for scenes around the event (default 20). Areas up to about 0.2 square degrees (the case studies are 0.15) are expected; larger ones are refused with a message.

| If it says | What it means | What to do |
| --- | --- | --- |
| No Copernicus Data Space credentials were found | The S3 keys (or a username and password) are not in the environment | Create keys in the Copernicus keys manager, set `AWS_ACCESS_KEY_ID` and `AWS_SECRET_ACCESS_KEY` (on Windows `pipeline/set_cdse_keys.ps1`), open a new terminal |
| The area needs four numbers, or is not W,S,E,N | The bounding box is malformed or the wrong way round | Longitude comes first: Nepal is about `85,28`, not `28,85` |
| The event date is not a date, or is in the future | The date is not `YYYY-MM-DD`, or there are no images of it yet | Correct the date |
| No Sentinel-1 pair brackets the event | No two scenes on one orbit track about 12 days apart enclose the date; the message lists the scenes found | Try `--search-days 40`; for a very recent event the later scene may not exist yet |
| No Sentinel-1 scenes cover the area | The catalogue has nothing there in that window | Check the area and the date |
| The Copernicus catalogue could not be searched | The service did not answer three times | Check the connection; try again later |
| 504 or 429 from `overpass-api.de` | The free OpenStreetMap service is busy | Run the same command again: layers already fetched are cached and are not asked for twice |
| The area is larger than anything this pipeline has run on | Over 0.4 square degrees | Run and publish smaller areas separately |

A run that maps no flood is a valid result: the dashboard says "No flood was mapped in this area" and that this is not proof of safety.

Publishing is all or nothing (`publish.py`): a failure half way leaves the areas already published as they were.

| Step | File | What it does |
| --- | --- | --- |
| Scene pair | `fetch_s1.py` | Finds a before/after Sentinel-1 GRD pair on the same orbit track, 12 days apart, bracketing the event; prefers full coverage of the area, then the earliest image after the event |
| Scene access | `download.py` | Reads the scene window and annotation from the Copernicus Data Space |
| DEM | `fetch_dem.py` | Copernicus DEM GLO-30 from the AWS open-data bucket, converted to ellipsoid heights |
| Preprocessing | `preprocess_s1.py` | Calibration to sigma0, thermal-noise removal, Lee speckle filter, Range-Doppler terrain correction, layover and shadow masks |
| Valley floor | `terrain.py` | Ground within 30 m above and 600 m of a river (pre-event OSM, or DEM-derived channels): where a flood can be |
| Flood map | `segment.py`, `predict.py` | Change detection on valley floors (water, debris; strong change elsewhere is "uncertain") against a three-image baseline, or the U-Net for water with the same rule for debris |
| False alarms | `null_test.py` | The same rule on pairs of scenes that are both from before the event: what it marks there is not the flood. A check on a finished run; `--attach` records it for the dashboard |
| Optical | `fetch_s2.py` | Sentinel-2 clear-sky composites either side of the event; confirms radar detections and fills radar blind spots on valley floors. It never removes a radar detection. Composites are cached in the run's `rasters/` folder |
| Pictures | `quicklook.py`, `add_outlines.py` | Before/after PNGs for the dashboard's satellite viewer, and the flood zones cut to those pictures' pixels (`outlines.json`); `add_outlines.py` adds the outlines to a run made earlier |
| Map quality | `osm_quality.py` | How complete the pre-event road map is around the buildings and settlements, recorded with the run |
| OpenStreetMap | `fetch_osm.py` | Buildings, roads, bridges, health facilities and places as of 30 days before the event (27 July 2026 for the case study) |
| Damage | `damage.py`, `infrastructure.py` | Features inside water or debris zones; health facilities cut from the road network |
| Cut-off settlements | `cutoff.py` | Settlements that could reach a hospital by road before the event and no longer can; also whether they can still reach a town (a place mapped as town or city), where the map has one |
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

Inputs are Sentinel-1, Copernicus DEM, OpenStreetMap as it was before the event, and Kuro Siwo for training. Published damage maps (Copernicus EMS, UNOSAT) and post-event OpenStreetMap edits are not used as inputs; `config.osm_snapshot_for` takes the snapshot 30 days before the event (never later than 27 July 2026), so an earlier event never reads mapping made after it, and `fetch_osm.py` refuses a snapshot date on or after 26 August 2026.

Datasets outside that list (modelled population, river flow) are not fetched unless `--context` is given, and nothing in the results reads them.

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

## Routes and navigation

The **Route** tool on the map plans the road from where you are (or a point you pick) to a settlement or a hospital, in the browser, on the run's own roads (`src/utils/routing.js`). It plans two routes: one that avoids every road section touching a flood zone (the same rule the cut-off analysis uses) and the fastest, which may cross them. The panel gives the distance, the steps, and how much of the route lies inside a mapped flood zone (flagged is not flooded: each piece of a flagged road is tested against the flood polygons). When no clear road exists it says so and shows the fastest route with its flooded stretch. Live navigation follows the GPS position (it needs https or localhost), snaps it to the route, announces the next turn and any flooded stretch ahead, and plans again if you leave the route. Times use assumed speeds by road class, since nothing in the data gives speeds; one-way roads are warned about, not obeyed.

## Before and after pictures

The satellite viewer in the Evidence section compares the two radar images with a slider, opens on a full-resolution close-up of where the most flood was mapped, and draws the mapped flood zones as outlines on both pictures (a button turns them off). Pixels the radar cannot see (layover and shadow) are hatched, not black, because dark means water in radar. A run made before the outlines existed gets them with `pipeline/add_outlines.py`.

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
- Wide checks of the frame join. A Sentinel-1 pass is cut into frames along the orbit and an area can straddle two (the 2021 Chamoli rehearsal: 84% and 16%). The pipeline reads and joins every frame of a pass and the dashboard states the share of the area the radar covers when it is under 97%; the join has been tested on one real area (Chamoli, 84% with one frame, 100% joined).
- A rule that tells ordinary river change from flood by more than the baseline does. Even the default rule marks 9% to 13% of its own area between two images from before the event.
- A language model behind the copilot: answers are templates filled from the computed figures.
- Drawing/annotation tool, timeline animation, Shapefile export, live polling, offline tiles / PWA. The one-page situation report (`/report`) is saved as PDF through the browser print dialog.
