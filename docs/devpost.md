# Devpost text (paste into the form, fill the brackets)

Project name: **TANGO: Flood Response System**

Tagline (200 characters): From Sentinel-1 radar to cut-off villages: maps flood and debris, flags buildings, roads and bridges in the flood zone, ranks who to reach first, and writes a situation report in English and Nepali.

Track: Space Track, Track B, *Mapping Flood Damage from Space*

Links: code <https://github.com/bhoopesh282008/Tango> · live dashboard <https://bhoopesh282008.github.io/Tango/> · video [YouTube link] · report `docs/report.pdf` in the repository

Team: [names, up to four, with the Devpost accounts that must be added]

---

## Inspiration

On 26 August 2026 a glacier collapse sent water, mud and rock down the Bhote Koshi and Trishuli valleys. Ground sensors were swept away and roads, bridges and phone lines failed. Radar satellites see through monsoon cloud, and the data is free, but turning two radar scenes into an answer a rescue team can use is the hard part. We wanted the answer to three questions, for any valley and date, and a system honest about how much of the damage it cannot see.

## What it does

Give TANGO an area and a flood date.

- **Where did the flood hit?** It finds two Sentinel-1 scenes on the same orbit track, twelve days apart, with the event between them, and compares them (against the median of three earlier scenes) on valley floors found from the Copernicus DEM and mapped rivers. It maps flood water and debris, and marks strong change elsewhere as "uncertain".
- **What was damaged?** It overlays pre-event OpenStreetMap buildings, roads and bridges. A road or bridge inside a flood zone is "in flood zone", not "destroyed": an overlap is not an inspection.
- **Who is cut off?** It finds the settlements that could reach a hospital by road before the event and cannot now. A settlement with no mapped road is "access unknown", never counted as safe or as cut off.

The dashboard shows the result on a map with a rescue priority table, a before/after radar viewer with the mapped flood outlined, a route planner that avoids flooded road sections (with live GPS navigation), and the bonus flood-path trace from any point upstream. A copilot answers four questions and writes the situation report in English and Nepali; every number comes from the run's own figures, and the one-page report prints to A4.

On the Trishuli corridor (16 and 28 August 2026): 2.1 km² of flood zones (1.4 water, 0.7 debris) plus 0.1 km² uncertain, 563 of 85,186 mapped buildings in a flood zone, 11 of 149 settlements cut off and 65 more with access unknown.

## How we built it

A Python pipeline (`pipeline/`) reads only the needed window of each Sentinel-1 scene from the Copernicus Data Space, calibrates it, removes noise and speckle, and terrain-corrects it with the Copernicus DEM. It classifies change on valley floors, overlays OpenStreetMap as it was 30 days before the event, builds the road graph and finds the cut-off settlements. It writes static files that a React dashboard reads: no server. The AI component is a small U-Net trained on a sample of Kuro Siwo, with its own held-out-event evaluation.

Built with: Python, rasterio, geopandas, networkx, PyTorch, Sentinel-1, Copernicus DEM, OpenStreetMap (Overpass), Kuro Siwo, React, Vite, MapLibre GL, Zustand, Tailwind, three.js, Vitest, Playwright and axe, GitHub Actions, GitHub Pages.

## Challenges we ran into

- **Slant-to-ground records are not exact at their stated times.** Blending them as stamped was off by up to 5.7 pixels; we fit the time offset that reproduces the product's own geolocation grid (0.03 px afterwards).
- **A fixed water threshold never fires in a gorge.** Along the Trishuli the darkened pixels have a median of -10.8 dB, not -18. We constrained the classification to ground near a mapped river instead.
- **A rule that cannot tell flood from ordinary change.** Run on two scenes both from before the event, the first rule marked 24% to 127% of its own area. We measured this, replaced the single "before" image with a three-image baseline, and now report the remaining 9% to 13% on the dashboard.
- **An area can straddle two image frames.** A first rehearsal on the 2021 Chamoli flood read one frame (84% coverage) and could not build its baseline; the pipeline now joins the frames of a pass.
- **Data rules.** Copernicus EMS, UNOSAT and post-event OpenStreetMap edits may only check results. Tests fail if the run path reaches the validation code or names a published damage map.

## Accomplishments we are proud of

- It runs end to end on real scenes, for areas it had not seen: the Trishuli corridor, a second reach, the Bhote Koshi valley (and a dry-season date on it), and the 2021 Chamoli glacier flood.
- It is checked against Copernicus EMS EMSR927 and says what the check shows: precision 0.88 to 0.99, but only 3% to 22% of the reference area found on the corridor, so every figure is a lower bound.
- The dashboard states its own limits (the lower-bound notice, "access unknown", "population not recorded", "not assessed") instead of filling gaps.
- 304 frontend tests, 191 pipeline tests, lint, accessibility checks and a build run in CI on every push to the main branch and every pull request.

## What we learned

Most of a debris corridor changes by less than 3 dB in a radar pair, so a radar-only map finds a fraction of it however the thresholds are set; the honest output is a lower bound with its false-alarm floor beside it. Our model beats thresholds on Kuro Siwo floods absent from its training (flood IoU 0.46 against 0.27; 0.55 against 0.34 for a smaller model trained with every test event held out) and does worse than the rule on Trishuli (it finds 2% to 14% of the reference area against 3% to 22%), because that dataset has almost no steep terrain. Both maps of the Trishuli scenes are in the dashboard's area list.

## What's next

Raising recall with evidence the rules allow (Sentinel-2 where the sky is clear, radar coherence), more events and valleys, a native speaker's review of the Nepali text, and offline use for field teams.

## Data and rules

Inputs: Sentinel-1, Copernicus DEM, OpenStreetMap as it was before the event, Kuro Siwo for training. Copernicus EMS EMSR927 was used only to check results. The ohsome API answered HTTP 403 on its geometry endpoints, so the pipeline takes the same snapshot date from the Overpass API and records which service supplied the data.

Contains modified Copernicus Sentinel data 2026. Produced using Copernicus WorldDEM-30 © DLR e.V. 2010–2014 and © Airbus Defence and Space GmbH 2014–2018 provided under COPERNICUS by the European Union and ESA; all rights reserved. © OpenStreetMap contributors. Bountos et al. (2024), Kuro Siwo, NeurIPS 37. Reference maps used for checking: European Union, Copernicus Emergency Management Service data (EMSR927).

An educational prototype, not an operational tool. No images of people affected by the disaster are used.
