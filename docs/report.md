# TANGO: mapping flood damage from space

Space Track challenge report. Case study: Trishuli flood, Rasuwa, Nepal, 26 August 2026.
Repository: https://github.com/bhoopesh282008/Tango

> **Draft, 10 October 2026.** The pipeline has run end to end on real Sentinel-1 scenes for three areas and its output has been compared with the EMSR927 reference (section 5). In short: **what it maps is almost always right, but it finds only a small part of the damage**, between 3% and 35% of the reference area depending on the reach. The flood figures below are therefore lower bounds.

## 1. What the system does

TANGO takes an area and a flood date and answers three questions for rescue teams: where the flood hit, what was damaged, and who is cut off. It has two parts.

- **A pipeline** (Python, `pipeline/`) that finds a before/after Sentinel-1 pair, calibrates and terrain-corrects it, maps flood water and debris, overlays pre-event OpenStreetMap, and works out which settlements have lost their road connection to a hospital, and whether they can still reach a town. One command runs it: `python run.py --bbox W,S,E,N --event YYYY-MM-DD`.
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

No published damage map and no post-event OpenStreetMap edit is used as an input. The OpenStreetMap snapshot is taken 30 days before the event (never later than 27 July 2026) and the fetch refuses any date on or after it. Datasets outside the list above (modelled population, river flow) are not fetched unless asked for with `--context`, which is off by default; nothing in the results reads them.

**One departure from the brief.** The ohsome API returned HTTP 403 on its geometry extraction endpoints while its metadata and count endpoints answered normally. The pipeline still asks ohsome first, and when refused takes the same snapshot date from the Overpass API, which serves the same OpenStreetMap history. The output records which service supplied the data. All OpenStreetMap figures in this report came through Overpass.

## 3. Method

**Scene pair.** The pipeline searches the Copernicus catalogue 20 days either side of the event and keeps only pairs on the same relative orbit and direction, 12 days apart, with the event between them. Scenes from different tracks view the terrain from different angles and cannot be compared pixel by pixel. Among valid pairs it prefers one whose scenes cover at least 97% of the area, then the earliest image after the event. For Trishuli three tracks have a valid pair; it selects track 85 ascending, 16 and 28 August 2026, whose post-event image is two days after the flood. Track 19 would give one ten days after, and track 121 covers only 43% of the area.

**Preprocessing, written from scratch without ESA SNAP.** Digital numbers are calibrated to sigma0 with the product's tables, speckle is reduced with a Lee filter, and the image is terrain-corrected by the Range-Doppler method onto a 10 m UTM grid (DEM heights converted from geoid to ellipsoid first). Layover and shadow are masked and both scenes share the grid, so they are aligned by construction. On the real scenes the result reproduces the product's own geolocation grid to 0.03 pixels and correlates 0.80 with brightness simulated from the DEM, best at zero shift. One correction came only from real data: the product's slant-to-ground records are not exact at their stated times, and using them as stamped misplaced pixels by up to 57 m.

**Flood map.** A flood fills valley floors, so change counts as flood only on ground within 30 m above and 600 m of a river (from pre-event OpenStreetMap, or from DEM-derived channels where no river is mapped). There, a drop of more than 3 dB is water or wet sediment and a rise of more than 3 dB is debris. Elsewhere only strong change (4.5 dB) over at least a hectare is kept, as "uncertain". The first version required water to be darker than -18 dB; on the real scenes only 5% of darkened river pixels are that dark, because a river tens of metres wide in a gorge never looks like open water at 10 m. The 30 m and 600 m limits are our assumptions; they were not tuned against any reference map. The alternative method uses the trained model for water (section 4) and the same rule for debris.

**Steadier baseline (the default).** A fixed threshold on one "before" image cannot tell ordinary change from flood: run on two scenes that are both from before the event, the rule marks as much as 24% to 30% of the mapped area in the two weeks before the flood and 94% to 127% in the monsoon onset. So "before" is the median of three images on the same track (the "before" scene and the two 12 days apart before it), and a change counts only if it also exceeds 3 robust standard deviations of that pixel's variation across the three; the 3 was fixed in advance, not tuned on a map. On the same pre-event pairs it marks 9% to 13% of its own area. On the Bhote Koshi valley, with a real event and a dry-season date, the single-image rule maps the same area for both (0.19 and 0.18 km²), while the baseline separates them (0.16 and 0.05 km², with 8 and 0 settlements cut off). `--baseline-images 1` gives the single-image rule. It needs three scenes on one track; with fewer it warns and falls back.

**Optical evidence.** With `--optical` the pipeline adds Sentinel-2 composites per pixel (the latest clear look before the event and the earliest after, with cloud, shadow and snow rejected by the scene classification layer). New water is a water index (MNDWI) turning positive; debris is vegetation (NDVI) disappearing. Optical never removes a radar detection and follows the same valley-floor rule; it raises confidence where both agree, fills radar blind spots at lower confidence, and marks change that only it sees as "uncertain".

**Damage.** Buildings, roads and bridges that intersect a water or debris zone are flagged. This is an overlap, not an inspection, so the dashboard labels them "in flood zone" and not "destroyed". Most rural roads have no name in OpenStreetMap, so an unnamed road is listed by its kind and nearest settlement.

**Cut-off settlements.** Roads become a graph. Flagged road segments are removed. A settlement is cut off when it had a road route to a hospital before the event and has none afterwards. A settlement with no mapped road before the event is reported as "access unknown", so that gaps in the map are not counted as flood damage. Whether the settlement can still reach a town (a place OpenStreetMap tags as town or city) is reported beside it, because the brief asks for the nearest town or hospital; a run with no town mapped, such as Trishuli, says nothing rather than guess.

**Flood path (bonus).** From any point, the path is traced on the DEM by expanding outward and always taking the lowest cell on the frontier. Unlike plain steepest descent, this climbs out of pits and DEM noise. The dashboard runs it in the browser when the user taps the map, and lists the settlements within 500 m of the path in downstream order.

## 4. AI component: flood segmentation model

A small U-Net (7.8 million weights) labels each pixel as no water, permanent water or flood from four bands: post-event VV and VH, pre-event VV and VH.

**Training.** We trained on a 10 GB sample of Kuro Siwo read as chunks spread evenly over every shard, so that every flood event is represented: 4,240 training patches, of which 709 patches from three whole events were held out for validation. 40 epochs took about 35 minutes on a laptop GPU (RTX 3050, 6 GB).

**Results on the Kuro Siwo test sample, flood class.**

| Test patches | Count | Model IoU | Model F1 | Threshold IoU | Threshold F1 |
|---|---|---|---|---|---|
| Floods absent from training | 312 | 0.46 | 0.63 | 0.27 | 0.43 |
| Floods also present in training | 858 | 0.69 | 0.82 | 0.45 | 0.62 |
| All | 1,170 | 0.67 | 0.80 | 0.44 | 0.61 |

**How to read this.** 11 of the 18 test activations also occur in the training sample, as other areas of the same flood. The first row is therefore the honest "never seen" figure. On those seven floods the IoU ranges from 0.16 to 0.82, and three are at about 0.20 or below. The model beats the threshold rule in every row, mostly by finding more of the flood (recall 0.74 against 0.29 on unseen floods) with more false alarms (precision 0.55 against 0.81).

**Himalayan scenes.** Almost none of the Kuro Siwo sample is mountainous: only 36 test patches have more than 300 m of relief, all from floods also present in training. On the real Trishuli scenes, which the model has never seen, it marks 0.53 km² of water on valley floors against 1.62 km² for the single-image threshold rule (0.43 km² common to both; the model cannot use the baseline). It fires only where the surface became very dark (median -15 dB), at the Betrawati confluence and parts of the channel below, and finds nothing in the upper gorge near Rasuwagadhi. Against EMSR927 (section 5) it does worse than the threshold rule in all three areas: 2% to 14% of the reference area against 3% to 22%, at similar precision (0.90 to 0.97). The gain on Kuro Siwo does not carry over to this valley.

## 5. Results for the Trishuli area

**Flood and damage map.** Scenes: Sentinel-1D, track 85 ascending, 16 and 28 August 2026 (baseline from 23 July and 4 August). A first run on a new area takes 4 to 16 minutes on a laptop, mostly reading scenes or waiting for the free OpenStreetMap service; a repeat from saved rasters takes under a minute.

| | Default (baseline) | Single image | Model for water |
|---|---|---|---|
| Water or wet sediment | 1.39 km² | 1.62 km² | 0.53 km² |
| Debris | 0.68 km² | 0.89 km² | 0.89 km² |
| Buildings in a flood zone | 563 of 85,186 | 672 | 154 |
| Road segments in a flood zone | 91 of 2,059 (8.4 km inside a zone) | 121 (10.8 km) | 56 |
| Bridges in a flood zone | 12 of 192 | 14 | 7 |
| Settlements cut off | 11 of 149 | 23 | 14 |

The valley floor is 2.8% of the area and 7% of the scene is lost to layover and shadow. Within 100 m of rivers the share of pixels that changed by more than 3 dB is about twice the share elsewhere, so the corridor signal is real, but part of it may be ordinary change in a monsoon river between two dates. The cut-off count depends on a few marginal road sections: the baseline halves it, from 23 to 11.

**Comparison with EMSR927.** The reference was used only after the runs, with nothing tuned on it. `python validate.py <run> cache/reference_emsr927` reproduces every figure here. The four reference areas with products are covered by two runs on the same scene pair: the main run above, and a second run to the south-west (84.9 to 85.25 E, 27.75 to 28.02 N) made with the same code and settings as a test on another area. The second run maps 4.7 km² (669 of 124,059 buildings, 159 road segments, 29 of 176 bridges, 14 of 116 settlements cut off, 13 of them also without a road to a town). The reference records the event as a mass movement and outlines the whole debris corridor by photo-interpretation of 0.3 m to 1 m optical images of 27 to 31 August. Parts the analysts marked "not analysed" are excluded.

| Area (run) | Reference | Ours (water + debris) | IoU | Precision | Recall | Model map: IoU / recall |
|---|---|---|---|---|---|---|
| 01 Syapru Besi (main) | 1.11 km² | 0.03 km² | 0.03 | 0.88 | 0.03 | 0.02 / 0.02 |
| 02 Timure (main) | 1.29 km² | 0.05 km² | 0.04 | 0.99 | 0.04 | 0.02 / 0.02 |
| 03 Bidur, northern 63% (main) | 4.09 km² | 0.95 km² | 0.21 | 0.93 | 0.22 | 0.14 / 0.14 |
| 03 Bidur, whole (second) | 5.89 km² | 1.36 km² | 0.21 | 0.94 | 0.22 | not run |
| 05 Phosretar (second) | 4.79 km² | 1.73 km² | 0.35 | 0.97 | 0.35 | not run |

| Damage (default map) | Main run: areas 01, 02, 03 north | Second run: areas 03, 05 |
|---|---|---|
| Reference buildings destroyed, damaged or possibly damaged; those in our zones | 2,538; 541 (21%) | 2,952; 756 (26%) |
| Buildings we flagged; those next to a reference building | 332; 314 (95%) | 456; 407 (89%) |
| Reference road segments destroyed or damaged; those our zones touch | 170; 76 (45%) | 333; 152 (46%) |
| Reference road segments with no visible damage; those our zones touch | 197; 3 (2%) | 522; 25 (5%) |
| Reference bridges destroyed or damaged; in our OpenStreetMap; flagged | 20; 12; 6 | 18; 10; 7 (Bidur only) |

The model column is from the single-image main run. The baseline costs little: recall falls slightly (0.23 to 0.22 at Bidur), precision is unchanged.

**Reading.** The map can be trusted where it says "flood" and cannot be trusted where it says nothing. Recall is poor because of what the radar pair shows, not mainly because of hidden slopes: inside the reference corridor under 7% of pixels are in layover or shadow, but 57% to 81% changed by less than 3 dB between the two dates. Only 15% of the corridor in the two gorge areas, 29% at Bidur and 43% at Phosretar crosses the 3 dB threshold in either direction, which caps what any rule of this kind can find; recall rises down the valley as the floor widens. Fresh debris over a gravel river bed or bare ground looks much the same to C-band radar at 10 m, while it is obvious in a 0.3 m optical image. Roads do better than buildings because a long segment needs only one detected crossing.

**Optical evidence on real scenes.** Both areas were also run with `--optical` (on the single-image maps). Four Sentinel-2 passes either side of the event gave a clear view before and after for 31% of the main area and 55% of the second. As designed, optical adds almost nothing to the flood classes: it confirms 0.07 km² of radar detections and fills about 0.01 km² of radar blind spots. Its other output is "uncertain" patches where radar saw no change. On valley floors these carry real signal (counting them, recall against the reference would be 0.33 to 0.65, at precision 0.70 to 0.96); away from them they are noise, 58 to 82 km² per run, mostly thin cloud and haze. We have not promoted them to a flood class, because that rule would have been chosen after looking at the reference.

Other results on real data:

| Item | Result |
|---|---|
| OpenStreetMap, 27 July 2026 | 85,186 buildings, 2,059 road segments (1,583 km), 192 bridges, 16 health facilities, 149 named settlements |
| Settlements with a road route to a hospital before the event | 84 of 149; the other 65 are "access unknown" (87% of buildings are within 300 m of a mapped road) |
| Settlements with a population in OpenStreetMap | 1 of 149 |
| Flood path from Rasuwagadhi | 59.9 km down the Trishuli; median 13 m from the OpenStreetMap river line, 90% within 42 m |

With population recorded for one settlement, the dashboard reports mapped buildings instead of people and does not convert one into the other.

## 6. Dashboard and situation report

The dashboard shows the flood zones, buildings, roads, settlements and infrastructure on a map with a choice of basemaps; headline figures with breakdowns; a rescue priority ranking of cut-off settlements; and export to CSV, GeoJSON and a printable report. A before/after viewer shows the radar pictures with the mapped flood outlined on them, and a route tool plans the road from anywhere to a settlement or hospital: one route that avoids every flagged road section and the fastest, with the distance and the stretches inside a flood zone, and live GPS navigation. Times use assumed speeds by road class, since nothing in the data gives speeds. The copilot answers "where did the flood hit", "what infrastructure is damaged", "which settlements are cut off" and "which should be rescued first" in English and Nepali, and assembles the four into a situation report.

**Every number comes from the maps.** One function derives all statistics from the loaded layers; the cards, the ranking, the exports and the copilot read from it. The copilot is not a language model: its answers are templates filled with those figures, so it cannot invent one. Typed questions are matched by keyword to the four topics, and anything else gets a plain "cannot answer".

**Missing is not zero.** Where the data lacks something the dashboard says so: unknown road access, population not recorded, power lines not assessed. The priority score uses only the factors recorded for every cut-off settlement, so a gap in the data cannot lift one settlement above another.

By default the dashboard opens on a bundled demo dataset, labelled "Demo data", whose geometry and figures are illustrative.

## 7. Limitations

- **No early warning.** Sentinel-1 returns to the same track every 12 days. The system maps a flood after the next pass; it cannot warn of a glacier collapse or a flood in progress. For Trishuli the earliest usable post-event scene is two days after the event.
- **Optical helps little as built.** Cloud left 31% and 55% of the two areas with a clear view on both sides of the event, and optical patches off the valley floor are mostly false (section 5).
- **Most of the damage is missed.** Against EMSR927 the map finds 3% to 35% of the affected area and 21% to 26% of the affected buildings (section 5). Every count in this report and in the dashboard is a lower bound; a settlement not shown as cut off may still be cut off. Rescue planning must not treat an unmarked area as safe.
- **False alarms remain.** Even the steadier rule marks 9% to 13% of its own mapped area between two images from before the flood (section 3), so part of every map is ordinary change, not the flood. The EMSR927 precision cannot show this: its reference is a wide corridor that contains the river.
- **The comparison is partial.** It covers one event and the four reference areas that have products. The 30 m, 600 m and 3 dB limits were not tuned on the reference, and we have not tried to raise recall, because fitting them to EMSR927 would make this comparison meaningless.
- **One image frame only.** A Sentinel-1 scene is cut into frames along the orbit. The pipeline reads one frame, so an area that straddles two is mapped only where the chosen frame covers it (a rehearsal on the 2021 Chamoli flood in Uttarakhand was covered 84%), and the steadier baseline then cannot be built. The share covered is recorded in the run's files.
- **Steep terrain.** Radar cannot see slopes in layover or shadow (7% of the scene). In the upper gorge near Rasuwagadhi, where this flood began, almost nothing is detected.
- **Valley floors only.** Flood classes are limited to ground near a mapped river, using limits we chose. A debris flow down an unmapped gully is at best marked "uncertain".
- **The model does worse than the thresholds here** and has no debris class. Debris always comes from fixed thresholds, which can also fire on wet soil, crops, snow and unrelated landslides.
- **Damage is an overlap.** A building in a flood zone is counted whether or not it was damaged; one destroyed outside the mapped zone is not. At 10 m, single houses are not resolved.
- **OpenStreetMap is incomplete.** Footpaths and small settlements may be missing; 65 of 149 settlements have no mapped road, and Trishuli maps no town, so "can it still reach a town" has no answer there. Building counts stand in for population, and not every building is a home. Multipolygon buildings are skipped.
- **Road cuts are coarse.** A road segment touching a flood zone is removed whole from the road network (its length in the totals is only the part inside the zone), so some settlements may be reported cut off when a way through exists, and the reverse. Most mapped "hospitals" are unnamed and probably health posts, which makes the cut-off test easier to pass than it should be.
- **Simplifications.** The flood path is a drainage line (direction, not depth, width, timing or reach). Preprocessing uses the product's orbit data, not precise orbit files, has no radiometric terrain flattening and applies only the range part of the noise tables.
- **Nepali text** was written without review by a native speaker.
- **Not an operational tool.** Map tiles come from free public services with no availability guarantee, and nothing here has been checked in the field.

No images of people affected by the disaster are used anywhere in the system or this report.

## 8. Attribution

Contains modified Copernicus Sentinel data 2026.

Produced using Copernicus WorldDEM-30 © DLR e.V. 2010–2014 and © Airbus Defence and Space GmbH 2014–2018 provided under COPERNICUS by the European Union and ESA; all rights reserved.

© OpenStreetMap contributors.

Bountos, N. I., Sdraka, M., Zavras, A., Karavias, A., Karasante, I., Herekakis, T., Thanasou, A., Michail, D., Papoutsis, I. (2024). Kuro Siwo: 33 billion m² under the water. A global multi-temporal satellite dataset for rapid flood mapping. Advances in Neural Information Processing Systems 37.

Reference maps for checking: European Union, Copernicus Emergency Management Service data (EMSR927).
