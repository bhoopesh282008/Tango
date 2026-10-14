# TANGO feature inventory

Read from `src/pages`, `src/components`, `src/hooks` and `src/services` (14 Oct 2026, build db87f95). The last column says where the feature appears in the full tour (`video/out/tango-full-tour.mp4`, 4:29) and in the 3-minute submission video (`video/out/tango-submission-3min.mp4`, 2:58). "Not shown" means the feature exists in the app but has no shot yet.

## Pipeline (Python, `pipeline/`)

| Feature | Where | In the videos |
| --- | --- | --- |
| End-to-end run from an area and a date (`run.py --bbox --event`), 8 numbered steps, preflight checks | `run.py`, `preflight.py` | Tour 0:21, 3-min 0:09 (real Teesta log) |
| Same-track Sentinel-1 pair 12 days apart; frames of a pass joined; `--track` | `fetch_s1.py` | Both (the log's pair line; the track on the rail) |
| Three-image baseline, valley-floor mask | `segment.py`, `terrain.py` | Both (narrated) |
| Sentinel-2 confirmation and blind-spot fill | `fetch_s2.py` | Both (viewer, Optical) |
| OpenStreetMap snapshot before the event, fetched in the background with retries | `fetch_osm.py` | Both (log, badge) |
| Damage overlay, flooded length of roads | `damage.py` | Both |
| Cut-off analysis (whole flagged roads, and flooded stretches only) | `cutoff.py`, `infrastructure.py` | Both |
| U-Net model (Kuro Siwo), held-out evaluation, model check on the rule's map | `train_model.py`, `evaluate_model.py`, `predict.py` | Both |
| Flood-path export, outlines, quicklooks | `floodpath.py`, `quicklook.py` | Viewer and flood path |
| EMSR927 comparison (checking only), no-change test | `validate.py`, `null_test.py` | Both (lower-bound figures) |
| Data rules as tests | `tests/test_compliance.py` | 3-min 0:17 (code card) |
| Publish to the dashboard | `publish.py` | Not shown |

## Dashboard (React, `src/`)

| Feature | Component | In the videos |
| --- | --- | --- |
| Splash: Earth, satellite pass, what has loaded, Open the analysis, EN/नेपाली | `Splash/*` | Tour 0:42 (open clip); 3-min not shown |
| Header: area selector (6 areas), Real data / Demo, Dashboard · Copilot · Report · Method, Export, theme | `Common/Header.jsx` | Tour 3:33 (area switch, Demo, Export, dark theme, Method) |
| Key figures, breakdown bar, lower-bound note | `Dashboard/Situation.jsx`, `CoverageNotice.jsx` | Both |
| "No flood found" and "not checked against a reference" notices | `NoFloodNotice.jsx`, `CoverageNotice.jsx` | Not-checked note: 3-min 0:17 (Teesta); no-flood state not shown |
| Map: satellite / drawn basemap, zoom, full screen, legend, flood zones, markers, popups | `Map/FloodMap.jsx`, `DamageOverlay.jsx`, `MapMarkers.jsx` | Both |
| Coordinates on click, copy | `Map/FloodMap.jsx` | Seen briefly (damage clip); copy not shown |
| Basemap notice when tiles fail | `hooks/useTileHealth.js` | Not shown |
| Layers panel | `Map/LayerControl.jsx` | Tour 2:16 |
| Filters | `Tools/FilterControls.jsx` | Tour 2:16 |
| Measure distance / area, undo, clear | `Tools/MeasurementTool.jsx` | Tour 2:16 (distance) |
| Flood path (bonus) | `Tools/FloodPathTool.jsx`, `utils/floodPath.js` | Both |
| Route planner: from / to, my location, choose on map, swap, avoid flooded vs fastest, margin, vehicle / on foot, directions, GPX, clear | `Map/RoutePanel.jsx`, `utils/routing.js` | Both (choose places, avoid vs fastest); my location, swap, on foot, directions, GPX not shown |
| Live navigation HUD with voice guidance | `Map/NavigationHud.jsx`, `hooks/useVoiceGuidance.js`, `services/speech.js` | Not shown (needs a moving GPS position) |
| Rescue priority table, sort by priority / buildings / damage, choose a row to fly to it | `Dashboard/SettlementPriorityRanking.jsx` | Both (choose Bhainse); sort options not shown |
| Before/after viewer: flood area / whole area, mapped flood outlines, radar / optical, zoom, full screen, download | `Dashboard/SatelliteViewer.jsx` | Tour 1:06 (all but full screen and download) |
| What was detected, model check, Sentinel-2 note, road-map completeness, infrastructure lists | `Dashboard/Evidence.jsx` | Both |
| Copilot: four questions, full report, typed questions, EN / NE, copy, download, clear | `Copilot/*`, `services/copilotService.js` | Both (questions, Nepali); typed question, copy, download, clear not shown |
| One-page situation report EN / NE, print or save as PDF | `pages/ReportPage.jsx` | Both (EN, NE); print dialog not shown |
| Exports: settlements CSV, statistics CSV, map layers GeoJSON | `Tools/ExportPanel.jsx`, `services/exportService.js` | Tour 3:33 (menu) |
| Method page | `pages/AboutPage.jsx` | Tour 3:33 |
| Demo dataset | `config/dataSource.js`, `data/mockData.js` | Tour 3:33 |
| Error boundary, error page, load errors with retry, toasts | `Common/ErrorBoundary.jsx`, `pages/ErrorPage.jsx`, `Common/Toast.jsx` | Not shown |
| Keyboard access: skip link, focus management on page change, menus with arrows / Escape | `hooks/useRouteChange.js`, `Common/Header.jsx` | Not shown |
