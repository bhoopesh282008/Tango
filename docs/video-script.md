# Demo video: script and shot list (3 minutes)

The brief asks for a 3-minute demo video; Devpost accepts 3 to 10 minutes on YouTube. This script is 3:00 at a calm 142 words a minute (about 425 words). Say less rather than speak faster. Screens come from the live site, <https://bhoopesh282008.github.io/Tango/>, because it is quick and shows real data.

Every figure below is read from the dashboard's Trishuli corridor area (16 and 28 Aug 2026). If you re-run anything before recording, check the figures on screen and change the words to match.

## Script

| Time | On screen | Say |
| --- | --- | --- |
| 0:00 to 0:12 | The splash: the Earth, the satellite making its pass. Press **Launch monitoring** at about 0:10 | "On 26 August 2026 a glacier collapse sent a flood down the Bhote Koshi and Trishuli valleys. Roads, bridges and phone lines failed. Rescuers needed to know: where is the damage, and who is cut off?" |
| 0:12 to 0:32 | A terminal running `run.py --bbox ... --event ... --publish` for a new area, sped up 10 times, numbered steps scrolling, ending in "Published". Then the header's area selector opens and the new area appears (see "Pre-record" below) | "TANGO answers from space. You give it an area and a flood date. It finds two Sentinel-1 radar scenes from the same orbit, twelve days apart, maps flood water and debris, adds pre-event OpenStreetMap buildings, roads and bridges, and checks which settlements lost their road to a hospital. One command, a few minutes, any valley." |
| 0:32 to 1:07 | **Dashboard**, Trishuli corridor. Hold on the four figures, then the map (Satellite), zoom to the Betrawati confluence so the zones show. Scroll to the before/after viewer, drag the slider, press **Mapped flood** off and on | "This is the Trishuli corridor. Radar change gives 2.2 square kilometres of flood zones: 1.4 water, 0.7 debris, and 0.1 we mark uncertain. 563 mapped buildings fall inside them, with 8.4 kilometres of road and 12 bridges. Roads and bridges are 'in flood zone', not 'destroyed': an overlap is not an inspection. The viewer draws the mapped flood on both radar images. Dark means water in radar, and hatching is where the radar cannot see." |
| 1:07 to 1:35 | The **Rescue priority** table: click Bhainse, the map flies to it. Open **Route**, plan to a hospital: the avoiding route and the fastest, the red flooded stretch | "Who is cut off? Eleven of 149 settlements have lost their road to a hospital. Sixty-five more have no mapped road at all, so we say 'access unknown', never zero. The table ranks the cut-off settlements, and Bhainse comes first. The Route tool plans a road around flooded sections, or shows the fastest road and how much of it lies in the flood." |
| 1:35 to 1:52 | **Copilot**: press "Which settlements cut off?", switch to नेपाली, press the full-report chip. Then **Report**, press **Print or save as PDF**, show one A4 page | "The copilot answers in English and Nepali. Every number comes from this run's own figures. It fills templates, it is not a language model, so it cannot invent a number. One click gives the one-page situation report." |
| 1:52 to 2:42 | The dashboard's lower-bound notice (hold on it). Then the report figures: our zones against EMSR927, and the model examples. Then the **Method** page, scrolling the limits | "Is it right? We compared with Copernicus EMS, for checking only, never as input. Where we mark flood we are usually right: precision up to 0.99. But we find only 3 to 22 percent of the reference area, so every figure is a lower bound. The same rule on two images from before the flood still marks 9 to 13 percent of its area, so some of every map is ordinary change. Our U-Net, trained on Kuro Siwo, scores 0.55 against 0.34 for thresholds on events it has not seen, but does worse on Trishuli. So the map you see is the rule's." |
| 2:42 to 3:00 | A plain slide: the attribution lines and the two links (below) | "TANGO cannot warn of a flood: Sentinel-1 returns every twelve days. It is an educational prototype, not an operational tool. Code and live demo are on GitHub." |

Slide text for the last 18 seconds:

> Contains modified Copernicus Sentinel data 2026.
> Produced using Copernicus WorldDEM-30 (c) DLR e.V. 2010-2014 and (c) Airbus Defence and Space GmbH 2014-2018 provided under COPERNICUS by the European Union and ESA; all rights reserved.
> (c) OpenStreetMap contributors. Kuro Siwo: Bountos et al., NeurIPS 2024.
> Reference maps used for checking only: European Union, Copernicus Emergency Management Service data (EMSR927).
>
> github.com/bhoopesh282008/Tango · bhoopesh282008.github.io/Tango

## Before recording

- **Browser:** a clean profile with no extensions, 1920 x 1080, zoom 100%, light theme, English. Clear the splash flag so it shows: in the console, `sessionStorage.clear()`, then reload.
- **Open the live site first** and let the Trishuli corridor load once (its buildings file alone is 20 MB, about 2.5 MB over the wire), so the cut to the map is instant.
- **Pre-record the terminal clip** (0:12 to 0:32) on another day or a quiet minute: a run from cached rasters takes under a minute; a first run takes 3 to 16 minutes, so record it once and speed it up. Start recording **after** the Copernicus keys are loaded, and never run `env`, `Get-ChildItem Env:` or `set_cdse_keys.ps1` on camera: the keys must not appear. The pipeline reports that credentials were found without printing them.
- Close other windows and turn notifications off. Record the voice in a quiet room, separately if you can.

## Things to say, and things not to say

Say: lower bound, precision, checking only, access unknown, in flood zone, educational prototype.

Do not say: "predicts floods", "real time", "accurate", "destroyed" (for roads and bridges), "AI copilot" (the copilot is templates; the AI component is the flood model). Do not show images of people affected by the flood: there are none in the app, so keep it that way in anything you add. Do not read out casualty figures.

## Cut list if it runs long

First: the Route tool (1:07 to 1:35 loses 10 seconds). Second: the Method page scroll. Never: the lower-bound notice and the model's Trishuli result; the honesty is worth marks (15% of the judging) and the AI component is another 25%.

## After recording

Export MP4, 1080p. Upload to YouTube as **Public** or **Unlisted** (check the Devpost rule), title "TANGO: flood damage from space (Space Track, Track B)", put both links and the attribution in the description, add captions (the automatic ones misspell Sentinel, Trishuli and Kuro Siwo; fix them or upload an SRT). Put the video link in the README's table (the row marked "added at submission") and in the Devpost form.
