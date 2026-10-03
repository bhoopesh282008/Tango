"""Compare a pipeline run with a reference (Copernicus EMS EMSR927).

The reference is for checking only; it must never feed the pipeline, and no
threshold may be tuned on these numbers.

    python validate.py out/trishuli cache/reference_emsr927 [--json result.json]

The reference folder holds one sub-folder per extracted EMS product
(EMSR927_AOI01_GRA_PRODUCT_v1, ...), each with its layers as GeoJSON and a
GeoPackage whose `source` table lists the images the analysts used.
"""
import argparse
import glob
import json
import os

import geopandas as gpd
from shapely.geometry import Point, box

FLOOD_KINDS = ['water', 'debris']
AFFECTED = ['Destroyed', 'Damaged']          # grades counted as hit by the event
POSSIBLE = 'Possibly damaged'
UNDAMAGED = 'No visible damage'
MIN_SHARE_INSIDE = 0.5                       # compare an AOI only if this much of it is in the run
ZONE_TOLERANCE_M = 10                        # one pixel
BUILDING_MATCH_M = 20                        # reference points and OSM footprints come from different maps
BRIDGE_MATCH_M = 50
LAYERS = ['areaOfInterestA', 'observedEventA', 'notAnalysedA', 'builtUpP', 'transportationL', 'transportationP']


def compare(zones, reference, within=None, kinds=FLOOD_KINDS):
    """IoU, precision and recall of mapped flood area against a reference.

    `within` is a geometry in the CRS of `zones`' UTM zone that limits both
    maps to the area the reference analysed.
    """
    crs = zones.estimate_utm_crs()
    mapped = zones[zones['type'].isin(kinds)].to_crs(crs).geometry.union_all()
    ref = reference.to_crs(crs).geometry.union_all()
    if within is not None:
        mapped, ref = mapped.intersection(within), ref.intersection(within)
    inter = mapped.intersection(ref).area
    union = mapped.union(ref).area
    return {
        'mapped_km2': round(mapped.area / 1e6, 3),
        'reference_km2': round(ref.area / 1e6, 3),
        'overlap_km2': round(inter / 1e6, 3),
        'iou': round(inter / union, 3) if union else 0.0,
        'precision': round(inter / mapped.area, 3) if mapped.area else None,
        'recall': round(inter / ref.area, 3) if ref.area else None,
    }


def compare_files(zones_path, reference_path):
    return compare(gpd.read_file(zones_path), gpd.read_file(reference_path))


def load_product(folder, crs):
    """The layers of one EMS product, reprojected, plus its post-event image list."""
    product = {'name': os.path.basename(os.path.normpath(folder)), 'images': []}
    for name in LAYERS:
        files = sorted(glob.glob(os.path.join(folder, f'*_{name}_*.json')))
        if files:
            layer = gpd.read_file(files[0])
            product[name] = layer[layer.geometry.notna()].to_crs(crs)
    for gpkg in glob.glob(os.path.join(folder, '*.gpkg')):
        import pyogrio
        for layer in (l[0] for l in pyogrio.list_layers(gpkg) if l[0].startswith('source')):
            table = pyogrio.read_dataframe(gpkg, layer=layer)
            post = table[table['eventphase'] == 'Post-event']
            product['images'] = [f"{r.source_nam} {r.src_date} ({r.sensor_res.strip()})" for r in post.itertuples()]
    return product


def study_area(product, run_area):
    """Part of the AOI covered by the run and analysed by the reference; share of the AOI inside the run."""
    aoi = product['areaOfInterestA'].geometry.union_all()
    inside = aoi.intersection(run_area)
    share = inside.area / aoi.area
    if 'notAnalysedA' in product and len(product['notAnalysedA']):
        inside = inside.difference(product['notAnalysedA'].geometry.union_all())
    return inside, share


def _share(part, whole):
    return round(part / whole, 3) if whole else None


def compare_buildings(buildings, zones, built_up, study):
    """Reference building points against our flood zones and our flagged buildings.

    The reference lists only affected buildings, so it gives recall directly
    (how many of them our zones reach) and a precision for our flags (how many
    lie next to a reference point).
    """
    ref = built_up[built_up.within(study)]
    flood = zones[zones['type'].isin(FLOOD_KINDS)].geometry.union_all().buffer(ZONE_TOLERANCE_M)
    in_zone = ref.within(flood)
    ours = buildings[buildings['damaged'] & buildings.intersects(study)]
    ref_near = ref.geometry.union_all().buffer(BUILDING_MATCH_M) if len(ref) else Point()
    confirmed = int(ours.intersects(ref_near).sum())
    hit = ref['damage_gra'].isin(AFFECTED)
    return {
        'reference_affected': int(len(ref)),
        'reference_destroyed_or_damaged': int(hit.sum()),
        'reference_possibly_damaged': int((ref['damage_gra'] == POSSIBLE).sum()),
        'reference_in_our_zones': int(in_zone.sum()),
        'recall': _share(int(in_zone.sum()), len(ref)),
        'recall_destroyed_or_damaged': _share(int((in_zone & hit).sum()), int(hit.sum())),
        'ours_flagged': int(len(ours)),
        'ours_next_to_reference': confirmed,
        'precision': _share(confirmed, len(ours)),
    }


def compare_roads(zones, roads_ref, study):
    """Reference road segments by damage grade, and how many of each our zones touch."""
    ref = roads_ref[roads_ref.intersects(study)]
    flood = zones[zones['type'].isin(FLOOD_KINDS)].geometry.union_all().buffer(ZONE_TOLERANCE_M)
    touched = ref.intersects(flood)
    hit, clear = ref['damage_gra'].isin(AFFECTED), ref['damage_gra'] == UNDAMAGED
    return {
        'reference_destroyed_or_damaged': int(hit.sum()),
        'of_which_our_zones_touch': int((touched & hit).sum()),
        'recall': _share(int((touched & hit).sum()), int(hit.sum())),
        'reference_no_visible_damage': int(clear.sum()),
        'of_which_our_zones_touch_wrongly': int((touched & clear).sum()),
        'false_alarm_rate': _share(int((touched & clear).sum()), int(clear.sum())),
    }


def compare_bridges(bridges, bridges_ref, study):
    """Reference bridge points graded destroyed or damaged against the bridges we flagged."""
    ref = bridges_ref[bridges_ref.within(study) & bridges_ref['damage_gra'].isin(AFFECTED)]
    ours = bridges[bridges.within(study)]
    flagged = ours[ours['status'] == 'destroyed']
    near_flagged = flagged.geometry.union_all().buffer(BRIDGE_MATCH_M) if len(flagged) else Point()
    near_mapped = ours.geometry.union_all().buffer(BRIDGE_MATCH_M) if len(ours) else Point()
    return {
        'reference_destroyed_or_damaged': int(len(ref)),
        'of_which_in_our_osm': int(ref.within(near_mapped).sum()),
        'of_which_we_flagged': int(ref.within(near_flagged).sum()),
        'ours_flagged': int(len(flagged)),
    }


def radar_view(out_dir, reference, change_db=3.0):
    """What the radar pair shows inside the reference area: why a miss is a miss.

    Shares of the reference area that are masked (layover or shadow), that
    darkened or brightened by `change_db`, or that show no such change.
    Returns None when the run kept no rasters.
    """
    pre_path, post_path = (os.path.join(out_dir, 'rasters', f'{n}_vv_db.tif') for n in ('pre', 'post'))
    if reference.is_empty or not (os.path.exists(pre_path) and os.path.exists(post_path)):
        return None
    import numpy as np
    import rasterio
    from rasterio import features
    with rasterio.open(pre_path) as a, rasterio.open(post_path) as b:
        pre, post = a.read(1), b.read(1)
        inside = features.rasterize([(reference, 1)], out_shape=a.shape, transform=a.transform, dtype='uint8') == 1
    if not inside.any():
        return None
    diff = (post - pre)[inside]
    masked = np.isnan(diff)
    return {
        'masked': round(float(masked.mean()), 3),
        'darker': round(float((diff[~masked] <= -change_db).sum() / diff.size), 3),
        'brighter': round(float((diff[~masked] >= change_db).sum() / diff.size), 3),
        'no_change': round(float((np.abs(diff[~masked]) < change_db).sum() / diff.size), 3),
    }


def load_run(out_dir):
    """The run's layers in its UTM zone, and the rectangle the run covered."""
    zones = gpd.read_file(os.path.join(out_dir, 'flood_zones.geojson'))
    crs = zones.estimate_utm_crs()
    buildings = gpd.read_file(os.path.join(out_dir, 'buildings.geojson')).to_crs(crs)
    with open(os.path.join(out_dir, 'infrastructure.json'), encoding='utf-8') as f:
        infra = [i for i in json.load(f) if i['type'] == 'bridge']
    bridges = gpd.GeoDataFrame({'status': [i['status'] for i in infra]},
                               geometry=[Point(i['lng'], i['lat']) for i in infra], crs='EPSG:4326').to_crs(crs)
    raster = os.path.join(out_dir, 'rasters', 'post_vv_db.tif')
    if os.path.exists(raster):
        import rasterio
        with rasterio.open(raster) as src:
            run_area = gpd.GeoSeries([box(*src.bounds)], crs=src.crs).to_crs(crs).iloc[0]
    else:
        run_area = box(*buildings.total_bounds)
    return {'zones': zones.to_crs(crs), 'buildings': buildings, 'bridges': bridges, 'run_area': run_area, 'crs': crs}


def compare_run(out_dir, reference_dir):
    """Every EMS product under `reference_dir` against one pipeline run."""
    run = load_run(out_dir)
    results = []
    for folder in sorted(glob.glob(os.path.join(reference_dir, 'EMSR*'))):
        product = load_product(folder, run['crs'])
        if 'areaOfInterestA' not in product or 'observedEventA' not in product:
            continue
        study, share = study_area(product, run['run_area'])
        result = {'product': product['name'], 'share_of_aoi_in_run': round(share, 3),
                  'post_event_images': product['images'],
                  'reference_event': sorted(set(product['observedEventA']['obj_desc']))}
        if share >= MIN_SHARE_INSIDE:
            result['extent'] = compare(run['zones'], product['observedEventA'], within=study)
            result['extent_with_uncertain'] = compare(run['zones'], product['observedEventA'], within=study,
                                                      kinds=FLOOD_KINDS + ['uncertain'])
            result['radar_view_of_reference'] = radar_view(
                out_dir, product['observedEventA'].geometry.union_all().intersection(study))
            if 'builtUpP' in product:
                result['buildings'] = compare_buildings(run['buildings'], run['zones'], product['builtUpP'], study)
            if 'transportationL' in product:
                result['roads'] = compare_roads(run['zones'], product['transportationL'], study)
            if 'transportationP' in product:
                result['bridges'] = compare_bridges(run['bridges'], product['transportationP'], study)
        results.append(result)
    return results


def summarise(results, reference='Copernicus EMS EMSR927'):
    """One short record of the comparison for the dashboard, or None if nothing was compared.

    One product per reference area: the first delineation where an area also
    has a monitoring product.
    """
    by_area = {}
    for r in results:
        if 'extent' not in r or r['extent']['recall'] is None:
            continue
        area = r['product'].split('_')[1]
        if area not in by_area or '_PRODUCT_' in r['product']:
            by_area[area] = r
    chosen = list(by_area.values())
    if not chosen:
        return None
    recall = [r['extent']['recall'] for r in chosen]
    precision = [r['extent']['precision'] for r in chosen if r['extent']['precision'] is not None]
    buildings = [r['buildings'] for r in chosen if 'buildings' in r]
    affected = sum(b['reference_affected'] for b in buildings)
    return {
        'reference': reference,
        'areas': len(chosen),
        'recall': [min(recall), max(recall)],
        'precision': [min(precision), max(precision)] if precision else None,
        'building_recall': _share(sum(b['reference_in_our_zones'] for b in buildings), affected),
    }


def attach(out_dir, summary):
    """Record the comparison in the run's satellite.json, where the dashboard reads it.

    Written after the run and read by nothing in the pipeline.
    """
    path = os.path.join(out_dir, 'satellite.json')
    with open(path, encoding='utf-8') as f:
        satellite = json.load(f)
    satellite['validation'] = summary
    with open(path, 'w', encoding='utf-8') as f:
        json.dump(satellite, f, ensure_ascii=False, separators=(',', ':'))


def main():
    parser = argparse.ArgumentParser(description=__doc__.split('\n')[0])
    parser.add_argument('out_dir')
    parser.add_argument('reference_dir')
    parser.add_argument('--json', help='also write the result to this file')
    parser.add_argument('--attach', action='store_true',
                        help="record a summary in the run's satellite.json so the dashboard can show it")
    args = parser.parse_args()
    results = compare_run(args.out_dir, args.reference_dir)
    if args.attach:
        attach(args.out_dir, summarise(results))
    for r in results:
        print(f"\n{r['product']}: {r['share_of_aoi_in_run']:.0%} of the AOI is inside the run; "
              f"reference maps {', '.join(r['reference_event'])} from {'; '.join(r['post_event_images']) or 'unknown images'}")
        if 'extent' not in r:
            print('  mostly outside the run: not compared')
            continue
        for key in ('extent', 'extent_with_uncertain', 'radar_view_of_reference', 'buildings', 'roads', 'bridges'):
            if r.get(key):
                print(f'  {key}: {r[key]}')
    if args.json:
        with open(args.json, 'w', encoding='utf-8') as f:
            json.dump(results, f, indent=2)


if __name__ == '__main__':
    main()
