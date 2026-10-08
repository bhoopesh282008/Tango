"""How much "flood" does the classifier find where nothing flooded?

    python null_test.py out/trishuli [--history 2]

The change detection compares two radar images 12 days apart. Some of what it marks can be
ordinary change (a river at a different level, wet soil, farming), not the flood. To measure that
without any published damage map, the same classifier, with the same valley-floor mask and
thresholds, is run on pairs of scenes that are BOTH from before the event, on the same orbit
track. Whatever it marks there is change that was not the flood: an upper bound on the false
alarms in the real result (the earlier pairs can hold real ordinary events too).

This is a check on a finished run, not a step of it; nothing it writes is read by the dashboard.
Reading the earlier scenes needs the Copernicus keys, as a run does.
"""
import argparse
import json
import sys
from datetime import date, timedelta
from pathlib import Path

import numpy as np

import config as C
import download
import fetch_dem
import fetch_osm
import fetch_s1
import preprocess_s1 as P
import segment
import terrain
from run import read_db, write_raster

DEFAULT_HISTORY = 2


def choose_history(items, orbit, state, pre_day, count=DEFAULT_HISTORY, tolerance_days=3, bbox=None):
    """Earlier scenes on the same track, about 12, 24, ... days before `pre_day`, nearest first.

    Returns a list of 0..count items, the k-th as close as it can be to pre_day - 12k days (within
    `tolerance_days`) among scenes that cover the area. A track is its orbit number and direction.
    """
    pre_day = pre_day if isinstance(pre_day, date) else date.fromisoformat(pre_day)
    same = [i for i in items
            if i.properties.get('sat:relative_orbit') == orbit and i.properties.get('sat:orbit_state') == state
            and fetch_s1._day(i) < pre_day and fetch_s1.coverage(i, bbox) >= fetch_s1.FULL_COVERAGE]
    chosen = []
    for k in range(1, count + 1):
        target = pre_day - timedelta(days=fetch_s1.REVISIT_DAYS * k)
        near = [i for i in same if abs((fetch_s1._day(i) - target).days) <= tolerance_days
                and i not in chosen]
        if not near:
            break                      # a gap in the series: later ones would not be 12 k days apart
        chosen.append(min(near, key=lambda i: abs((fetch_s1._day(i) - target).days)))
    return chosen


def flagged_km2(pre, post, slope, floor, transform, crs):
    """{'water': km2, 'debris': km2, 'uncertain': km2} the classifier marks for this pair, as zones."""
    classes, conf = segment.classify(pre, post, slope, floor)
    zones = segment.vectorise(classes, conf, transform, crs)
    return {name: round(float(zones.loc[zones['type'] == name, 'area_km2'].sum()), 3)
            for name in ('water', 'debris', 'uncertain')}


def summarise(real, nulls):
    """Plain figures: the false-alarm area on no-change pairs against the area the real pair marks."""
    flood = lambda k: k['water'] + k['debris']
    rows = [{'pair': n['pair'], 'water_km2': n['water'], 'debris_km2': n['debris'], 'uncertain_km2': n['uncertain'],
             'flood_km2': round(flood(n), 3),
             'share_of_real': round(flood(n) / flood(real), 3) if flood(real) else None} for n in nulls]
    return {'real_flood_km2': round(flood(real), 3), 'no_change_pairs': rows,
            'worst_share_of_real': max((r['share_of_real'] for r in rows if r['share_of_real'] is not None), default=None)}


def attach(run_dir, result):
    """Record a short summary in the run's satellite.json, where the dashboard reads it.

    Written after the run and read by nothing in the pipeline, as validate.attach is.
    """
    path = Path(run_dir) / 'satellite.json'
    satellite = json.loads(path.read_text(encoding='utf-8'))
    satellite['null_test'] = {
        'real_flood_km2': result['real_flood_km2'],
        'worst_share_of_real': result['worst_share_of_real'],
        'pairs': [{'pair': r['pair'], 'flood_km2': r['flood_km2'], 'share_of_real': r['share_of_real']}
                  for r in result['no_change_pairs']],
    }
    path.write_text(json.dumps(satellite, ensure_ascii=False, separators=(',', ':')), encoding='utf-8')


def main():
    ap = argparse.ArgumentParser(description=__doc__.split('\n')[0])
    ap.add_argument('run_dir', help='a finished run (out/trishuli): its rasters and satellite.json are read')
    ap.add_argument('--history', type=int, default=DEFAULT_HISTORY, help='how many earlier scenes (default 2)')
    ap.add_argument('--attach', action='store_true',
                    help="record a summary in the run's satellite.json so the dashboard can show it")
    args = ap.parse_args()

    run = Path(args.run_dir)
    satellite = json.loads((run / 'satellite.json').read_text(encoding='utf-8'))
    bbox = ','.join(str(v) for v in satellite['area']['bbox'])
    pre_meta = satellite['before']
    pre_day = date.fromisoformat(pre_meta['date'])
    rasters = run / 'rasters'

    pre, transform, crs = read_db(rasters / 'pre_vv_db.tif')
    post, _, _ = read_db(rasters / 'post_vv_db.tif')
    slope = read_db(rasters / 'slope.tif')[0]

    items = fetch_s1.search(bbox, (pre_day - timedelta(days=fetch_s1.REVISIT_DAYS * args.history + 6)).isoformat(),
                            (pre_day - timedelta(days=1)).isoformat())
    history = choose_history(items, pre_meta['relative_orbit'], pre_meta['orbit_state'], pre_day, args.history, bbox=bbox)
    if not history:
        sys.exit(f'No earlier scenes on track {pre_meta["relative_orbit"]} {pre_meta["orbit_state"]} cover {bbox} '
                 f'in the weeks before {pre_day}: {fetch_s1.describe_scenes(items) or "none found"}.')
    print(f'Earlier scenes on the same track: {", ".join(fetch_s1._day(i).isoformat() for i in history)}', flush=True)

    crs_name = crs.to_string()
    xs = transform.c + transform.a * (np.arange(pre.shape[1]) + 0.5)
    ys = transform.f + transform.e * (np.arange(pre.shape[0]) + 0.5)
    height = fetch_dem.fetch(crs_name, xs, ys)
    rivers = fetch_osm.fetch_layer('waterways', bbox, satellite.get('osm_snapshot', C.OSM_SNAPSHOT))
    if rivers is not None and 'waterway' in rivers.columns:
        rivers = rivers[rivers['waterway'] == 'river']
    floor, _ = terrain.valley_floor(height, abs(transform.a), rivers, transform, crs)

    scenes = []
    for item in history:
        path = rasters / f'history_{fetch_s1._day(item).isoformat()}_vv_db.tif'
        if not path.exists():
            print(f'Reading the {fetch_s1._day(item)} scene and correcting it for terrain', flush=True)
            scene = download.get_scene(item, 'vv')
            ann = P.parse_annotation(scene.product_xml)
            geo = P.geocode(ann, crs_name, xs, ys, height)
            window = P.radar_window(geo, ann)
            db = P.terrain_correct(download.read_window(scene, window), window, geo,
                                   P.parse_calibration(scene.calibration_xml), P.parse_noise(scene.noise_xml))
            write_raster(path, db, crs, transform)
        scenes.append((fetch_s1._day(item).isoformat(), read_db(path)[0]))

    # oldest first, ending with the run's own "before" scene
    series = list(reversed(scenes)) + [(pre_day.isoformat(), pre)]
    real = flagged_km2(pre, post, slope, floor, transform, crs)
    nulls = []
    for (d0, a), (d1, b) in zip(series, series[1:]):
        nulls.append({'pair': f'{d0} to {d1}', **flagged_km2(a, b, slope, floor, transform, crs)})
    result = summarise(real, nulls)
    result['real_pair'] = f'{pre_day} to {satellite["after"]["date"]}'
    (run / 'null_test.json').write_text(json.dumps(result, indent=1), encoding='utf-8')
    if args.attach:
        attach(run, result)
    print(json.dumps(result, indent=1))


if __name__ == '__main__':
    try:
        main()
    except RuntimeError as error:
        print(f'\nStopped: {error}', file=sys.stderr)
        sys.exit(1)
