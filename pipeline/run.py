"""End-to-end run: preprocessed Sentinel-1 pair + pre-event OSM -> dashboard files.

    python run.py --bbox 85.1,27.9,85.5,28.3 --pre pre_vv_db.tif --post post_vv_db.tif \
        --event 2026-08-26 --out out/

--pre/--post are terrain-corrected VV backscatter in dB on the same grid
(same orbit track). Preprocessing raw GRD scenes is not automated yet.
"""
import argparse
import json
import sys
import time
from pathlib import Path

import geopandas as gpd
import numpy as np
import rasterio
from shapely.geometry import Point

import config as C
import context
import cutoff
import damage
import download
import export
import fetch_dem
import fetch_osm
import fetch_s1
import floodpath
import infrastructure
import osm_quality
import preflight
import preprocess_s1 as P
import publish
import quicklook
import segment
import terrain


class Progress:
    """Numbered, timed step lines, so a run of many minutes can be seen to be moving."""

    def __init__(self, total):
        self.total, self.count, self.started = total, 0, time.monotonic()

    def step(self, text):
        self.count += 1
        print(f'[{self.count}/{self.total}  {self.elapsed()}] {text}', flush=True)

    def elapsed(self):
        seconds = int(time.monotonic() - self.started)
        return f'{seconds // 60}:{seconds % 60:02d}'


def read_db(path):
    with rasterio.open(path) as src:
        return src.read(1).astype('float32'), src.transform, src.crs


def write_raster(path, array, crs, transform):
    with rasterio.open(path, 'w', driver='GTiff', height=array.shape[0], width=array.shape[1],
                       count=1, dtype='float32', crs=crs, transform=transform,
                       nodata=np.nan, compress='deflate') as dst:
        dst.write(array.astype('float32'), 1)


def prepare_pair(bbox, event, out, res=10.0, pols=('vv',), search_days=20, say=print):
    """Raw GRD scenes -> co-registered dB rasters. Returns paths and scene metadata.

    paths are keyed 'pre', 'post' (VV), 'pre_vh', 'post_vh' when VH is asked for, and 'slope'.
    """
    out = Path(out)
    out.mkdir(parents=True, exist_ok=True)
    before, after = fetch_s1.find_pair(bbox, event, search_days=search_days)
    say(f"  Pair: {before.properties['datetime'][:10]} to {after.properties['datetime'][:10]}, "
        f"track {before.properties.get('sat:relative_orbit')} {before.properties.get('sat:orbit_state')}, "
        f"{(fetch_s1._day(after) - fetch_s1.date.fromisoformat(str(event))).days} days after the event")
    crs, xs, ys = P.make_grid([float(v) for v in bbox.split(',')], res)
    transform = fetch_dem.grid_transform(xs, ys)
    height = fetch_dem.fetch(crs, xs, ys)

    # Rasters already in the output folder are reused, so a second run (for
    # example to add the VH band for the model) only processes what is missing.
    record = out / 'scenes.json'
    saved = json.loads(record.read_text(encoding='utf-8')) if record.exists() else {}
    paths, meta = {'slope': out / 'slope.tif'}, {}
    for label, item in (('pre', before), ('post', after)):
        geo = ann = None
        for pol in pols:
            key = label if pol == 'vv' else f'{label}_{pol}'
            paths[key] = out / f'{label}_{pol}_db.tif'
            if paths[key].exists() and saved.get(label, {}).get('id') == item.id:
                continue
            say(f'  Reading the {label} scene ({pol.upper()}) and correcting it for terrain; this is the slow part')
            scene = download.get_scene(item, pol)
            ann = P.parse_annotation(scene.product_xml)
            if geo is None:     # both polarisations share one viewing geometry
                geo = P.geocode(ann, crs, xs, ys, height)
            window = P.radar_window(geo, ann)
            db = P.terrain_correct(download.read_window(scene, window), window, geo,
                                   P.parse_calibration(scene.calibration_xml),
                                   P.parse_noise(scene.noise_xml))
            write_raster(paths[key], db, crs, transform)
        if geo is None:
            meta[label] = saved[label]
        else:
            write_raster(paths['slope'], geo['slope_deg'], crs, transform)
            meta[label] = {
                'id': item.id, 'date': item.properties['datetime'][:10], 'resolution': f'{res:.0f} m',
                'relative_orbit': item.properties.get('sat:relative_orbit'),
                'orbit_state': item.properties.get('sat:orbit_state'),
                'area_covered': round(fetch_s1.coverage(item, bbox), 3),
                'geolocation_check_px': P.check_geolocation(ann),
                'masked_fraction': round(float((geo['layover'] | geo['shadow']).mean()), 3),
            }
        meta[label]['sensor'] = f"Sentinel-1 GRD ({'+'.join(p.upper() for p in pols)})"
    record.write_text(json.dumps(meta), encoding='utf-8')
    return paths, meta


def settlements_from_places(places):
    """OSM places -> settlement table. Population only where OSM carries it."""
    rows = []
    for i, (_, p) in enumerate(places.iterrows()):
        name, name_np = names(p)
        if not name:
            continue
        try:
            population = int(str(p.get('population')).replace(',', '')) or None
        except (TypeError, ValueError):
            population = None
        point = p.geometry.representative_point()   # places mapped as areas count too
        rows.append({'id': f's{i + 1:03d}', 'name': name, 'name_np': name_np,
                     'lat': point.y, 'lng': point.x, 'population': population, 'geometry': point})
    return gpd.GeoDataFrame(rows, columns=['id', 'name', 'name_np', 'lat', 'lng', 'population', 'geometry'],
                            geometry='geometry', crs=places.crs)


def settlement_records(settlements, status):
    """Rows for settlements.json. pandas holds a missing value as NaN, which is not valid JSON."""
    rows = []
    for s in settlements.to_dict('records'):
        population = s['population']
        rows.append({
            'id': s['id'], 'name': s['name'], 'name_np': text(s['name_np']),
            'lat': s['lat'], 'lng': s['lng'],
            'population': None if population is None or population != population else int(population),
            'connected': status[s['id']],
        })
    return rows


def text(value):
    """A tag value, or None when the tag is absent (pandas reads that as NaN)."""
    return value if isinstance(value, str) and value else None


def names(row):
    """(display name, Nepali name) from OSM tags.

    In Nepal the plain `name` tag is usually in Devanagari, so the English name
    is preferred for display and a Devanagari `name` doubles as the Nepali one.
    """
    local = text(row.get('name'))
    devanagari = bool(local) and any('ऀ' <= ch <= 'ॿ' for ch in local)
    return (text(row.get('name:en')) or local,
            text(row.get('name:ne')) or (local if devanagari else None))


ROAD_KINDS = {'track': 'track', 'unclassified': 'road', 'residential': 'residential road', 'service': 'service road'}


def describe_roads(roads, settlements=None):
    """Add length_km and a display name to the road segments.

    Most rural roads have no name in OSM. Those get their reference number if
    they have one, otherwise their kind and the nearest settlement ("Unnamed
    track near Lingling"), so a list of cut roads says where the cuts are.
    """
    roads = roads.copy()
    metric = roads.to_crs(roads.estimate_utm_crs())
    roads['length_km'] = (metric.length / 1000).round(2).to_numpy()

    near = [None] * len(roads)
    if settlements is not None and len(settlements) and len(roads):
        points = metric[['geometry']].copy()
        points['geometry'] = points.geometry.representative_point()
        places = settlements.to_crs(metric.crs)[['name', 'geometry']].rename(columns={'name': 'place'})
        joined = gpd.sjoin_nearest(points, places, how='left')
        near = joined[~joined.index.duplicated()]['place'].reindex(roads.index).tolist()

    labels = []
    for (_, row), place in zip(roads.iterrows(), near):
        name = names(row)[0] or (f"Road {text(row.get('ref'))}" if text(row.get('ref')) else None)
        if not name:
            highway = text(row.get('highway')) or 'road'
            name = f"Unnamed {ROAD_KINDS.get(highway, f'{highway} road')}"
            if isinstance(place, str):
                name += f' near {place}'
        labels.append(name)
    roads['name'] = labels
    return roads


def default_area_name(buildings, settlements):
    """'Bidur area': named after the settlement with the most mapped buildings, or None."""
    if not len(settlements) or 'settlement_id' not in buildings.columns:
        return None
    counts = buildings['settlement_id'].value_counts()
    if not len(counts):
        return None
    name = settlements.set_index('id')['name'].get(counts.idxmax())
    return f'{name} area' if isinstance(name, str) and name else None


def hospitals_or_any(health):
    """Hospitals as destinations; any health facility where none is mapped."""
    health = health.copy()
    health['geometry'] = health.geometry.representative_point()
    if 'amenity' in health.columns:
        hospitals = health[health['amenity'] == 'hospital']
        if len(hospitals):
            return hospitals
    return health


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument('--bbox', required=True, help='W,S,E,N')
    ap.add_argument('--pre', help='existing terrain-corrected VV dB raster (skips the satellite steps)')
    ap.add_argument('--post')
    ap.add_argument('--event', required=True)
    ap.add_argument('--slope', help='optional slope raster (degrees) on the same grid')
    ap.add_argument('--model', help='trained U-Net checkpoint; without it the threshold baseline is used')
    ap.add_argument('--optical', action='store_true',
                    help='add Sentinel-2: confirm radar detections and fill radar blind spots where the sky was clear')
    ap.add_argument('--search-days', type=int, default=20,
                    help='how many days either side of the event to look for Sentinel-1 scenes (default 20)')
    ap.add_argument('--no-context', action='store_true',
                    help='skip the context beside the map (modelled population and river flow from open datasets)')
    ap.add_argument('--out', default=str(C.OUT))
    ap.add_argument('--name', help='what the dashboard calls this area; default: its largest mapped settlement')
    ap.add_argument('--publish', action='store_true',
                    help="copy the result to the dashboard's data folder (public/data) and list it there")
    args = ap.parse_args()

    have_rasters = bool(args.pre and args.post)
    progress = Progress(7 + int(args.optical) + int(not args.no_context))
    progress.step('Checking the area, the date, the credentials and the output folder')
    try:
        for warning in preflight.check(args.bbox, args.event, args.out,
                                       need_scenes=not have_rasters, optical=args.optical):
            print(f'  Warning: {warning}', flush=True)
    except preflight.PreflightError as error:
        print(error, file=sys.stderr)
        sys.exit(2)
    # Only mapping made before the event may be used (see config.osm_snapshot_for)
    snapshot = C.osm_snapshot_for(args.event)

    scenes = {}
    if not have_rasters:
        if args.model and not Path(args.model).exists():
            ap.error(f'model file not found: {args.model}')
        progress.step(f'Finding the Sentinel-1 pair around {args.event} and reading the scenes')
        paths, scenes = prepare_pair(args.bbox, args.event, Path(args.out) / 'rasters',
                                     pols=('vv', 'vh') if args.model else ('vv',),
                                     search_days=args.search_days)
        args.pre, args.post, args.slope = str(paths['pre']), str(paths['post']), str(paths['slope'])
    elif args.model:
        ap.error('--model needs the VH rasters too, so it cannot be combined with --pre/--post')
    else:
        progress.step('Using the rasters given (--pre and --post)')

    pre, transform, crs = read_db(args.pre)
    post, _, _ = read_db(args.post)
    slope = read_db(args.slope)[0] if args.slope else None

    # Where a flood can be: ground within a few tens of metres above the nearest drainage line.
    progress.step(f'OpenStreetMap as of {snapshot}: buildings, roads, bridges, health facilities, places, rivers')
    osm = fetch_osm.fetch_all(args.bbox, snapshot)
    progress.step('Elevation, and where the valley floor is')
    cell = abs(transform.a)
    xs = transform.c + transform.a * (np.arange(pre.shape[1]) + 0.5)
    ys = transform.f + transform.e * (np.arange(pre.shape[0]) + 0.5)
    height = fetch_dem.fetch(crs.to_string(), xs, ys)
    # Rivers only: mountain streams run down every gully, and a mask around all of them is no mask.
    rivers = osm['waterways']
    if rivers is not None and 'waterway' in rivers.columns:
        rivers = rivers[rivers['waterway'] == 'river']
    floor, drainage_source = terrain.valley_floor(height, cell, rivers, transform, crs)

    progress.step('Mapping flood' + (' with the trained model' if args.model else ' from the radar change'))
    if args.model:
        import predict   # imported here so the baseline runs without PyTorch installed
        model, device = predict.load_model(args.model)
        probability = predict.flood_probability(model, device, post, read_db(paths['post_vh'])[0],
                                                pre, read_db(paths['pre_vh'])[0])
        classes, conf = predict.classify(probability, pre, post, slope, floor)
        method = 'U-Net trained on Kuro Siwo (water) + change detection (debris), on valley floors'
    else:
        classes, conf = segment.classify(pre, post, slope, floor)
        method = 'Sentinel-1 change detection on valley floors'

    # Pictures for the dashboard's before/after viewer.
    out = Path(args.out)
    out.mkdir(parents=True, exist_ok=True)
    images = {'pre': {'url': 'before.png'}, 'post': {'url': 'after.png'}}
    quicklook.radar_png(pre, out / 'before.png')
    quicklook.radar_png(post, out / 'after.png')

    optical = None
    if args.optical:
        progress.step('Sentinel-2: confirming detections and filling radar blind spots (reads two sets of scenes; slow)')
        import fetch_s2   # imported here so a radar-only run does not need it
        before, after, optical = fetch_s2.looks_around(args.bbox, args.event, crs, transform, pre.shape,
                                                       cache=out / 'rasters')
        if before is None:
            optical['used'] = False
            optical['note'] = 'No Sentinel-2 pass on both sides of the event; radar only.'
        else:
            seen = np.isfinite(pre) & np.isfinite(post)   # radar is blind only in layover and shadow
            classes, conf, counts = fetch_s2.fuse(classes, conf, seen, *fetch_s2.classify(before, after), floor=floor)
            optical.update(used=True, pixels=counts)
            quicklook.optical_png(before, out / 'before_optical.png')
            quicklook.optical_png(after, out / 'after_optical.png')
            images['pre']['optical_url'], images['post']['optical_url'] = 'before_optical.png', 'after_optical.png'
            method += ' + Sentinel-2 (confirms detections, fills radar blind spots)'
    zones = segment.vectorise(classes, conf, transform, crs)
    # A full-resolution close-up of where the most flood was mapped, for the before/after viewer.
    detail_window = quicklook.detail_pngs(pre, post, np.isin(classes, (C.CLASS_WATER, C.CLASS_DEBRIS)), out)

    progress.step('Damage to buildings, roads and bridges, and which settlements are cut off')
    roads = damage.flag_damaged(osm['roads'], zones)
    buildings = damage.flag_damaged(osm['buildings'], zones)
    settlements = settlements_from_places(osm['places'])
    buildings = damage.assign_settlement(buildings, settlements)

    status = cutoff.connectivity(settlements, hospitals_or_any(osm['health']), roads)
    # How much of the answer rests on missing map data (pre-event OpenStreetMap only)
    quality = osm_quality.summarise(buildings, roads, status)

    roads = describe_roads(roads, settlements)
    roads['flooded_km'] = damage.flooded_length_km(roads, zones)

    detail = None
    if detail_window:
        row, col, rows, cols = detail_window
        images['pre']['detail_url'], images['post']['detail_url'] = 'before_detail.png', 'after_detail.png'
        # Named after the settlement nearest its centre, so the viewer can say where it is.
        centre = Point(*(transform * (col + cols / 2, row + rows / 2)))
        near = None
        if len(settlements):
            near = settlements.loc[settlements.to_crs(crs).distance(centre).idxmin(), 'name']
        detail = {'near': near, 'width_km': round(cols * cell / 1000, 1), 'height_km': round(rows * cell / 1000, 1)}

    settlement_rows = settlement_records(settlements, status)
    area_name = args.name or default_area_name(buildings, settlements) or f'Area {args.bbox}'
    infra = infrastructure.build(osm['bridges'], osm['health'], roads, zones, settlements)
    context_data = None
    if not args.no_context:
        # Shown beside the map only: nothing above reads it, and nothing in the results depends on it.
        progress.step('Context beside the map: modelled population and river flow (not used in the results)')
        context_data = context.build([float(v) for v in args.bbox.split(',')], args.event, buildings, osm['waterways'])
        print('  ' + ('Context found: ' + ', '.join(k for k in ('population', 'river') if context_data and context_data[k])
                      if context_data else 'No context available (offline, or no coverage); the run is not affected'), flush=True)
    progress.step('Writing the dashboard files')
    export.export_all(args.out, zones, buildings, roads, settlement_rows, infra, {
        'event': args.event, 'method': method,
        'area': {'name': area_name, 'bbox': [float(v) for v in args.bbox.split(',')]},
        'osm_snapshot': snapshot,
        'osm_quality': quality,
        'osm_source': sorted({v for k, v in fetch_osm.SOURCES.items() if v != 'unavailable'}),
        'before': {**(scenes.get('pre') or {}), **images['pre']},
        'after': {**(scenes.get('post') or {}), **images['post']},
        'optical': optical,
        'detail': detail,
        'valley_floor': {'drainage': drainage_source, 'share_of_area': round(float(floor.mean()), 3)},
    })
    context.write(args.out, context_data)
    # The DEM the dashboard's flood-path tool traces on
    floodpath.export_dem(args.out, [float(v) for v in args.bbox.split(',')])
    if args.publish:
        entry = publish.publish(args.out)
        print(f"Published '{entry['name']}' as {entry['id']}. Reload the dashboard to see it.")
    print(f'\nDone in {progress.elapsed()}. Output: {args.out}', flush=True)
    if not args.publish:
        print(f'To show it in the dashboard: python publish.py {args.out} --name "<what to call this area>"', flush=True)
    print(json.dumps({
        'zones': len(zones),
        'flooded_km2': float(zones.loc[zones['type'].isin(['water', 'debris']), 'area_km2'].sum()),
        'buildings_damaged': int(buildings['damaged'].sum()),
        'roads_damaged': int(roads['damaged'].sum()),
        'cut_off': [k for k, v in status.items() if v is False],
        'unknown': [k for k, v in status.items() if v is None],
    }, indent=2))


if __name__ == '__main__':
    try:
        main()
    except RuntimeError as error:
        # The pipeline's own, deliberate errors say what to do; a stack trace would only hide it.
        print(f'\nStopped: {error}', file=sys.stderr)
        sys.exit(1)
