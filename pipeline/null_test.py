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
import fetch_dem
import fetch_osm
import fetch_s1
import segment
import terrain
from run import read_db, read_history

DEFAULT_HISTORY = 2


# The search for earlier scenes is shared with the run's own option for a multi-image baseline
choose_history = fetch_s1.choose_history


def flagged_km2(pre, post, slope, floor, transform, crs, spread=None):
    """{'water': km2, 'debris': km2, 'uncertain': km2} the classifier marks for this pair, as zones."""
    classes, conf = segment.classify(pre, post, slope, floor, spread)
    zones = segment.vectorise(classes, conf, transform, crs)
    return {name: round(float(zones.loc[zones['type'] == name, 'area_km2'].sum()), 3)
            for name in ('water', 'debris', 'uncertain')}


def baseline_rule(series, target_index, slope, floor, transform, crs):
    """Km2 the baseline rule marks for series[target_index], against the three images before it; None if too few."""
    if target_index < 3:
        return None
    median, spread = segment.temporal_baseline(np.stack([a for _, a in series[target_index - 3:target_index]]))
    return flagged_km2(median, series[target_index][1], slope, floor, transform, crs, spread)


def summarise(real, nulls, real_baseline=None):
    """Plain figures: the false-alarm area on no-change pairs against the area the real pair marks.

    Each of `nulls` may carry a 'baseline' entry (the baseline rule on the same target); `real_baseline`
    is that rule on the real pair. The shares are against the real pair under the same rule.
    """
    flood = lambda k: k['water'] + k['debris']
    rows = []
    for n in nulls:
        row = {'pair': n['pair'], 'water_km2': n['water'], 'debris_km2': n['debris'], 'uncertain_km2': n['uncertain'],
               'flood_km2': round(flood(n), 3),
               'share_of_real': round(flood(n) / flood(real), 3) if flood(real) else None}
        if n.get('baseline') is not None:
            row['baseline_flood_km2'] = round(flood(n['baseline']), 3)
            row['baseline_share_of_real'] = (round(flood(n['baseline']) / flood(real_baseline), 3)
                                             if real_baseline is not None and flood(real_baseline) else None)
        rows.append(row)
    result = {'real_flood_km2': round(flood(real), 3), 'no_change_pairs': rows,
              'worst_share_of_real': max((r['share_of_real'] for r in rows if r['share_of_real'] is not None), default=None)}
    if real_baseline is not None:
        result['real_baseline_flood_km2'] = round(flood(real_baseline), 3)
    return result


def attach(run_dir, result):
    """Record a short summary in the run's satellite.json, where the dashboard reads it.

    Written after the run and read by nothing in the pipeline, as validate.attach is. It records the
    rule the run used: the baseline rule's figures for a run made with --baseline-images, otherwise
    the single-image rule's.
    """
    path = Path(run_dir) / 'satellite.json'
    satellite = json.loads(path.read_text(encoding='utf-8'))
    if satellite.get('baseline'):
        rows = [{'pair': r['pair'], 'flood_km2': r['baseline_flood_km2'], 'share_of_real': r['baseline_share_of_real']}
                for r in result['no_change_pairs'] if 'baseline_flood_km2' in r]
        real, rule = result.get('real_baseline_flood_km2'), 'baseline'
    else:
        rows = [{'pair': r['pair'], 'flood_km2': r['flood_km2'], 'share_of_real': r['share_of_real']}
                for r in result['no_change_pairs']]
        real, rule = result['real_flood_km2'], 'single image'
    shares = [r['share_of_real'] for r in rows if r['share_of_real'] is not None]
    satellite['null_test'] = {'rule': rule, 'real_flood_km2': real, 'worst_share_of_real': max(shares, default=None), 'pairs': rows}
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

    history, items = fetch_s1.find_history(bbox, pre_meta['relative_orbit'], pre_meta['orbit_state'], pre_day, args.history)
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

    # oldest first, ending with the run's own "before" scene
    series = read_history(history, rasters, crs, transform, pre.shape, height) + [(pre_day.isoformat(), pre)]
    real = flagged_km2(pre, post, slope, floor, transform, crs)
    real_baseline = None
    if len(series) >= 3:
        median, spread = segment.temporal_baseline(np.stack([a for _, a in series[-3:]]))
        real_baseline = flagged_km2(median, post, slope, floor, transform, crs, spread)
    nulls = []
    for j in range(1, len(series)):
        (d0, a), (d1, b) = series[j - 1], series[j]
        nulls.append({'pair': f'{d0} to {d1}', **flagged_km2(a, b, slope, floor, transform, crs),
                      'baseline': baseline_rule(series, j, slope, floor, transform, crs)})
    result = summarise(real, nulls, real_baseline)
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
