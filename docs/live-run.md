# Live run: what to do on the day

The judges give an area and a date; the system has to run end to end from raw Sentinel-1 data. This is the runbook for doing that on this laptop. The command and the table of messages are also in the README ("On the day: running a new area").

## The night before (10 minutes)

1. **Keys.** The Copernicus S3 keys expire on **1 Nov 2026**; if the day is after that, create new ones first in the Copernicus keys manager and run `pipeline/set_cdse_keys.ps1`. Check they are set without showing them (PowerShell):

   ```powershell
   foreach ($k in 'AWS_ACCESS_KEY_ID','AWS_SECRET_ACCESS_KEY') { "$k : " + $(if ([Environment]::GetEnvironmentVariable($k,'User')) { 'present' } else { 'MISSING' }) }
   ```

   Never print the values, never run `env` or `Get-ChildItem Env:` on a shared screen or in a recording.
2. **The code works.** From the repository root: `pipeline/.venv/Scripts/python -m pytest pipeline/tests -q` (191 tests) and `npm run test`.
3. **The dashboard shows real data.** `.env.local` holds `VITE_DATA_URL=/data`; `npm run dev`; the header's area selector lists the published areas.
4. **Room and power.** Free disk space (a run leaves a few hundred MB in `pipeline/out` and `pipeline/cache`; this laptop had 183 GB free on 12 Oct), the charger plugged in, sleep off, a second internet connection (a phone hotspot) in reach.

## When they give you the area and the date

1. Write down **west,south,east,north** in degrees (longitude first: Nepal is about `85,28`, not `28,85`) and the date as `YYYY-MM-DD`. The area should be about 0.2 square degrees or less: `(east - west) x (north - south)`. From 0.2 to 0.4 the run warns that it will be long; above 0.4 it refuses. The case studies are 0.15 to 0.16.
2. Open a **new** terminal (so it has the keys) in `pipeline` and run:

   ```powershell
   .venv\Scripts\python run.py --bbox <west,south,east,north> --event <YYYY-MM-DD> --out out\<folder> --name "<area name>" --publish
   ```

   A new `--out` folder for every area. It checks the area, the date, the credentials and the folder first and reports every problem at once, before downloading anything.
3. It prints eight numbered steps with the time. The slow one is step 2, reading the two Sentinel-1 scenes (about 4 minutes for the Teesta valley rehearsal); step 5 reads two more earlier scenes for the baseline.
4. When it prints that the area is published, reload the dashboard (`npm run dev`) and pick the new area in the header's selector. Show the figures, the map, the before/after viewer, the rescue table and `/report`.

The public Pages site does not change when you publish: it holds the data it was deployed with. To show a new area there too, run `npm run deploy:pages -- --push` (about two minutes, then a minute for Pages to rebuild). On the day, show the new area on the local dashboard.

## When it stops

| It says | Do |
| --- | --- |
| `Overpass ... did not answer ... after 5 tries over about 7 minutes. Layers already fetched are cached and the satellite scenes are saved, so run the same command again` | **Run the same command again.** It continues from the cache. This happened on the first try of the Teesta rehearsal (the free OpenStreetMap service answered 504 for more than ten minutes) and the second try got past OpenStreetMap in under a minute. Public Overpass mirrors were tried from this network on 12 Oct and none answered (kumi.systems, private.coffee and mail.ru timed out; openstreetmap.fr refused), so there is no second server to switch to |
| `No Sentinel-1 pair brackets the event` | `--search-days 40`. For a very recent event the later scene may not exist yet |
| `No Copernicus Data Space credentials were found` | The terminal was opened before the keys were set: open a new one |
| `The area is larger than anything this pipeline has run on` | Over 0.4 square degrees: split it into two areas, run and publish each |
| The area is covered 84% by one frame (a note in the dashboard's lower-bound notice) | The pass was cut into frames and the radar covers only part of the area; the dashboard states the share. Nothing to do |

The other messages are in the README's table.

## While it runs (5 to 15 minutes)

Do not sit in silence and do not narrate the terminal. Use the time on the **Method** page and the Trishuli case study: what the rule does and why only valley floors count; the lower-bound notice and why every figure is a lower bound; the false-alarm test; cut off versus "access unknown". Show the published rehearsals (Bhote Koshi, Chamoli, Teesta valley) as evidence that the system runs on ground it had not seen.

## If it does not finish

Say what happened and where it stopped (the log names the step), show the published areas and the rehearsals, and do not claim a result that is not there. A run that stops on a free public service is a limit worth stating in the Q&A; the report's section 7 already lists it.

## Rehearsals so far

| Area | Event | Time | Notes |
| --- | --- | --- | --- |
| Trishuli corridor, Rasuwa | 26 Aug 2026 | 4 min 22 s first run; under 1 min from saved rasters | the case study |
| Bhote Koshi valley (new to the system) | 26 Aug 2026 | 6 min 17 s once OpenStreetMap was cached; about 13 min more waiting for Overpass | three-image baseline |
| Bhote Koshi, dry-season date | 15 Feb 2026 | 15 min 44 s, 13 of them Overpass retries | the rule maps 0.048 km² against 0.159 km² for the August date; this Bhote Koshi is in Sindhupalchok, not the case-study river, and no flood there is confirmed |
| Chamoli glacier flood, Uttarakhand | 7 Feb 2021 | Overpass busy for about 15 min | the area straddles two image frames; found and fixed here |
| Teesta valley, Sikkim | 4 Oct 2023 | 9 min 32 s on the second try. The first try ran about 15 minutes (4 reading the scenes) and stopped when Overpass did not answer; the second continued from the cache and spent 8 minutes reading the two earlier scenes for the baseline | South Lhonak glacial-lake flood, a state, terrain and year the system had not seen. Track 12, 25 Sep and 7 Oct 2023 (3 days after), baseline from 1, 13 and 25 Sep. 373 zones (3.1 km²), 1 of 31 settlements cut off (none if only the flooded stretches close), 5 with access unknown, 172 of 8,829 buildings in a flood zone. Not checked against any reference map |
