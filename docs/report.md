# TANGO: mapping flood damage from space

Space Track challenge report. Case study: Trishuli flood, Rasuwa, Nepal, 26 August 2026.
Repository: https://github.com/bhoopesh282008/Tango

> **Draft, 3 October 2026.** Two sections are marked PENDING because the Sentinel-1 stage has not yet been run on real scenes. Everything else reports work that was actually run, with the numbers it produced.

## 1. What the system does

TANGO takes an area and a flood date and answers three questions for rescue teams: where the flood hit, what was damaged, and who is cut off. It has two parts.

- **A pipeline** (Python, `pipeline/`) that finds a before/after Sentinel-1 pair, calibrates and terrain-corrects it, maps flood water and debris, overlays pre-event OpenStreetMap, and works out which settlements have lost their road connection to a hospital. One command runs it: `python run.py --bbox W,S,E,N --event YYYY-MM-DD`.
- **A dashboard** (React) that shows the result on a map with statistics, a rescue priority ranking, a one-page situation report and a copilot that answers four questions in English and Nepali.

There is no server. The pipeline writes static files and the dashboard reads them.

## 2. Data and rules

| Data | Use | Source |
|---|---|---|
| Sentinel-1 GRD (VV, VH) | Before/after radar scenes | Copernicus Data Space |
| Copernicus DEM GLO-30 | Terrain correction, slope, flood path | AWS open data |
| OpenStreetMap, 27 July 2026 | Buildings, roads, bridges, health facilities, places | ohsome API, with Overpass API as fallback |
| Kuro Siwo | Training the flood model | Hugging Face, CC BY 4.0 |
| Copernicus EMS EMSR927 | Checking only | not used as input |

No published damage map and no post-event OpenStreetMap edit is used as an input. The OpenStreetMap fetch refuses any snapshot date on or after the event.

**One departure from the brief.** The ohsome API returned HTTP 403 on its geometry extraction endpoints while its metadata and count endpoints answered normally. The pipeline still asks ohsome first, and when refused takes the same snapshot date from the Overpass API, which serves the same OpenStreetMap history. The output records which service supplied the data. All OpenStreetMap figures in this report came through Overpass.

## 3. Method

**Scene pair.** The pipeline searches the Copernicus catalogue 20 days either side of the event and keeps only pairs on the same relative orbit and direction, 12 days apart, with the event between them. Scenes from different tracks view the terrain from different angles and cannot be compared pixel by pixel. Among valid pairs it prefers one whose scenes cover the whole area, then the earliest image after the event. For Trishuli three tracks have a valid pair; it selects track 85 ascending, 16 and 28 August 2026, whose post-event image is two days after the flood. Track 19 would give one ten days after, and track 121 covers only 43% of the area.

**Preprocessing, written from scratch without ESA SNAP.** Digital numbers are calibrated to sigma0 with the product's calibration and thermal-noise tables, speckle is reduced with a Lee filter, and the image is terrain-corrected by the Range-Doppler method: for every cell of a 10 m UTM grid the zero-Doppler time is solved on the orbit from the product annotation, the slant range is converted to a ground-range pixel, and the image is sampled there. DEM heights are converted from geoid to ellipsoid first. Cells in layover or shadow are masked. Both scenes are resampled to the same grid, so they are aligned by construction.

**Flood map.** Two methods. The baseline compares backscatter: a pixel that is dark after the event (below -18 dB) and dropped by more than 3 dB is water; a rise of more than 3 dB is debris; weaker change is "uncertain". Slopes above 20 degrees are excluded. The alternative uses the trained model for water (section 4) and the same rule for debris.

**Damage.** Buildings, roads and bridges that intersect a water or debris zone are flagged. This is an overlap, not an inspection, so the dashboard labels them "in flood zone" and not "destroyed". Most rural roads have no name in OpenStreetMap, so an unnamed road is listed by its kind and nearest settlement.

**Cut-off settlements.** Roads become a graph. Flagged road segments are removed. A settlement is cut off when it had a road route to a hospital before the event and has none afterwards. A settlement with no mapped road before the event is reported as "access unknown", so that gaps in the map are not counted as flood damage.

**Flood path (bonus).** From any point, the path is traced on the DEM by expanding outward and always taking the lowest cell on the frontier. Unlike plain steepest descent, this climbs out of pits and DEM noise. The dashboard runs it in the browser when the user taps the map, and lists the settlements within 500 m of the path in downstream order.

## 4. AI component: flood segmentation model

A small U-Net (7.8 million weights) labels each pixel as no water, permanent water or flood from four bands: post-event VV and VH, pre-event VV and VH.

**Training.** Kuro Siwo's labelled Sentinel-1 patches total 170 GB. We trained on a 10 GB sample read as chunks spread evenly over every shard, so that every flood event is represented: 4,240 training patches, of which 709 patches from three whole events were held out for validation. 40 epochs took about 35 minutes on a laptop GPU (RTX 3050, 6 GB).

**Results on the Kuro Siwo test sample, flood class.**

| Test patches | Count | Model IoU | Model F1 | Threshold IoU | Threshold F1 |
|---|---|---|---|---|---|
| Floods absent from training | 312 | 0.46 | 0.63 | 0.27 | 0.43 |
| Floods also present in training | 858 | 0.69 | 0.82 | 0.45 | 0.62 |
| All | 1,170 | 0.67 | 0.80 | 0.44 | 0.61 |

**How to read this.** 11 of the 18 test activations also occur in the training sample, as other areas of the same flood. The first row is therefore the honest "never seen" figure. On those seven floods the IoU ranges from 0.16 to 0.82, and three are at about 0.20 or below. The model beats the threshold rule in every row, mostly by finding more of the flood (recall 0.74 against 0.29 on unseen floods) at the cost of more false alarms (precision 0.55 against 0.81).

**Himalayan scenes: PENDING.** The brief asks how the model performs on Himalayan scenes it has never seen. We cannot answer that yet. Almost none of the sample is mountainous: only 36 test patches have more than 300 m of relief, and all of them come from floods also present in training. The answer needs the Trishuli run compared against EMSR927.

## 5. Results for the Trishuli area

**Flood and damage map: PENDING.** The Sentinel-1 stage has been unit-tested on synthetic data (orbit geometry, calibration, layover and shadow on synthetic slopes) but has not been run on a real scene. There is no real flood map, no damage count and no comparison with EMSR927 in this draft.

What has been run on real data:

| Item | Result |
|---|---|
| OpenStreetMap, 27 July 2026 | 85,186 buildings, 2,059 road segments (1,583 km), 192 bridges, 16 health facilities, 149 named settlements |
| Settlements with a road route to a hospital before the event | 84 of 149; the other 65 are "access unknown" |
| Settlements with a population in OpenStreetMap | 1 of 149 |
| DEM | 440 m to 6,888 m; spot heights match known values (Dhunche 2,018 m, Betrawati 617 m) |
| Area under 20 degrees of slope | 14.6% |
| Flood path from Rasuwagadhi | 59.9 km down the Trishuli; median 13 m from the OpenStreetMap river line, 90% within 42 m |

Two of these shape what the system can say. With population recorded for one settlement, the dashboard reports mapped buildings instead of people and does not convert one into the other. With 14.6% of the area under 20 degrees, most of the scene is outside what the threshold classifier will consider.

## 6. Dashboard and situation report

The dashboard shows the flood zones, buildings, roads, settlements and infrastructure on a map with a choice of basemaps; headline figures with breakdowns; a rescue priority ranking of cut-off settlements; and export to CSV, GeoJSON and a printable report. The copilot answers "where did the flood hit", "what infrastructure is damaged", "which settlements are cut off" and "which should be rescued first" in English and Nepali, and assembles the four into a situation report.

**Every number comes from the maps.** One function derives all statistics from the loaded layers; the cards, the ranking, the exports and the copilot read from it. The copilot is not a language model: its answers are templates filled with those figures, so it cannot invent one. Typed questions are matched by keyword to the four topics, and anything else gets a plain "cannot answer".

**Missing is not zero.** Where the data lacks something the dashboard says so: unknown road access, population not recorded, power lines not assessed. The priority score uses only the factors recorded for every cut-off settlement, so a gap in the data cannot lift one settlement above another.

By default the dashboard opens on a bundled demo dataset, labelled "Demo data", whose geometry and figures are illustrative.

## 7. Limitations

- **No early warning.** Sentinel-1 returns to the same track every 12 days. The system maps a flood after the next pass; it cannot warn of a glacier collapse or a flood in progress. For Trishuli the earliest usable post-event scene is two days after the event.
- **Steep terrain.** Radar cannot see slopes in layover or shadow, and the classifier excludes slopes above 20 degrees. In this valley that leaves a small share of the area, mostly the valley floor.
- **The flood map is unvalidated.** See section 5.
- **The model is untested in mountains** and has no debris class. Debris always comes from fixed thresholds, which can also fire on wet soil, crops, snow and unrelated landslides.
- **Damage is an overlap.** A building in a flood zone is counted whether or not it was damaged; one destroyed outside the mapped zone is not. At 10 m, single houses are not resolved.
- **OpenStreetMap is incomplete.** Footpaths and small settlements may be missing; 65 of 149 settlements have no mapped road. Building counts stand in for population, each building is assigned to the nearest named place, and not every building is a home. Multipolygon buildings are skipped.
- **Road cuts are coarse.** A road segment touching a flood zone is removed whole, so some settlements may be reported cut off when a way through exists, and the reverse. Most of the 14 mapped "hospitals" are unnamed and are probably health posts, which makes the cut-off test easier to pass than it should be.
- **The flood path is a drainage line.** It gives direction, not depth, width, timing or reach.
- **The preprocessing is simplified.** Orbit data comes from the product, not precise orbit files; there is no radiometric terrain flattening; only the range part of the noise tables is applied.
- **Nepali text** was written without review by a native speaker.
- **Not an operational tool.** Map tiles come from free public services with no availability guarantee, and nothing here has been checked in the field.

No images of people affected by the disaster are used anywhere in the system or this report.

## 8. Attribution

Contains modified Copernicus Sentinel data 2026.

Produced using Copernicus WorldDEM-30 © DLR e.V. 2010–2014 and © Airbus Defence and Space GmbH 2014–2018 provided under COPERNICUS by the European Union and ESA; all rights reserved.

© OpenStreetMap contributors.

Bountos, N. I., Sdraka, M., Zavras, A., Karavias, A., Karasante, I., Herekakis, T., Thanasou, A., Michail, D., Papoutsis, I. (2024). Kuro Siwo: 33 billion m² under the water. A global multi-temporal satellite dataset for rapid flood mapping. Advances in Neural Information Processing Systems 37.

Reference maps for checking: European Union, Copernicus Emergency Management Service data (EMSR927).
