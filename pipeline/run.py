"""End-to-end run: preprocessed Sentinel-1 pair + pre-event OSM -> dashboard files.

    python run.py --bbox 85.1,27.9,85.5,28.3 --pre pre_vv_db.tif --post post_vv_db.tif \
        --event 2026-08-26 --out out/

--pre/--post are terrain-corrected VV backscatter in dB on the same grid
(same orbit track). Preprocessing raw GRD scenes is not automated yet.
"""
import argparse
import json
from pathlib import Path

import geopandas as gpd
import numpy as np
import rasterio
from shapely.geometry import Point

import config as C
import cutoff
import damage
import download
import export
import fetch_dem
import fetch_osm
import fetch_s1
import floodpath
import infrastructure
import preprocess_s1 as P
import segment


def read_db(path):
    with rasterio.open(path) as src:
        return src.read(1).astype('float32'), src.transform, src.crs


def write_raster(path, array, crs, transform):
    with rasterio.open(path, 'w', driver='GTiff', height=array.shape[0], width=array.shape[1],
                       count=1, dtype='float32', crs=crs, transform=transform,
                       nodata=np.nan, compress='deflate') as dst:
        dst.write(array.astype('float32'), 1)


def prepare_pair(bbox, event, out, res=10.0, pols=('vv',)):
    """Raw GRD scenes -> co-registered dB rasters. Returns paths and scene metadata.

    paths are keyed 'pre', 'post' (VV), 'pre_vh', 'post_vh' when VH is asked for, and 'slope'.
    """
    out = Path(out)
    out.mkdir(parents=True, exist_ok=True)
    before, after = fetch_s1.find_pair(bbox, event)
    crs, xs, ys = P.make_grid([float(v) for v in bbox.split(',')], res)
    transform = fetch_dem.grid_transform(xs, ys)
    height = fetch_dem.fetch(crs, xs, ys)

    paths, meta, slope = {}, {}, None
    for label, item in (('pre', before), ('post', after)):
        for pol in pols:
            scene = download.get_scene(item, pol)
            ann = P.parse_annotation(scene.product_xml)
            geo = P.geocode(ann, crs, xs, ys, height)
            window = P.radar_window(geo, ann)
            db = P.terrain_correct(download.read_window(scene, window), window, geo,
                                   P.parse_calibration(scene.calibration_xml),
                                   P.parse_noise(scene.noise_xml))
            key = label if pol == 'vv' else f'{label}_{pol}'
            paths[key] = out / f'{label}_{pol}_db.tif'
            write_raster(paths[key], db, crs, transform)
        slope = geo['slope_deg']
        meta[label] = {
            'id': item.id, 'date': item.properties['datetime'][:10],
            'sensor': f"Sentinel-1 GRD ({'+'.join(p.upper() for p in pols)})", 'resolution': f'{res:.0f} m',
            'relative_orbit': item.properties.get('sat:relative_orbit'),
            'orbit_state': item.properties.get('sat:orbit_state'),
            'geolocation_check_px': P.check_geolocation(ann),
            'masked_fraction': round(float((geo['layover'] | geo['shadow']).mean()), 3),
        }
    paths['slope'] = out / 'slope.tif'
    write_raster(paths['slope'], slope, crs, transform)
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


def describe_roads(roads):
    """Add length_km and a display name (English where OSM has one) to the road segments."""
    roads = roads.copy()
    metric = roads.to_crs(roads.estimate_utm_crs())
    roads['length_km'] = (metric.length / 1000).round(2).to_numpy()
    roads['name'] = [names(row)[0] or 'Unnamed road' for _, row in roads.iterrows()]
    return roads


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
    ap.add_argument('--out', default=str(C.OUT))
    args = ap.parse_args()

    scenes = {}
    if not (args.pre and args.post):
        if args.model and not Path(args.model).exists():
            ap.error(f'model file not found: {args.model}')
        paths, scenes = prepare_pair(args.bbox, args.event, Path(args.out) / 'rasters',
                                     pols=('vv', 'vh') if args.model else ('vv',))
        args.pre, args.post, args.slope = str(paths['pre']), str(paths['post']), str(paths['slope'])
    elif args.model:
        ap.error('--model needs the VH rasters too, so it cannot be combined with --pre/--post')

    pre, transform, crs = read_db(args.pre)
    post, _, _ = read_db(args.post)
    slope = read_db(args.slope)[0] if args.slope else None

    if args.model:
        import predict   # imported here so the baseline runs without PyTorch installed
        model, device = predict.load_model(args.model)
        probability = predict.flood_probability(model, device, post, read_db(paths['post_vh'])[0],
                                                pre, read_db(paths['pre_vh'])[0])
        classes, conf = predict.classify(probability, pre, post, slope)
        method = 'U-Net trained on Kuro Siwo (water) + threshold rule (debris)'
    else:
        classes, conf = segment.classify(pre, post, slope)
        method = 'Sentinel-1 change detection (baseline thresholds)'
    zones = segment.vectorise(classes, conf, transform, crs)

    osm = fetch_osm.fetch_all(args.bbox)
    roads = damage.flag_damaged(osm['roads'], zones)
    buildings = damage.flag_damaged(osm['buildings'], zones)
    settlements = settlements_from_places(osm['places'])
    buildings = damage.assign_settlement(buildings, settlements)

    status = cutoff.connectivity(settlements, hospitals_or_any(osm['health']), roads)

    roads = describe_roads(roads)

    settlement_rows = settlement_records(settlements, status)
    infra = infrastructure.build(osm['bridges'], osm['health'], roads, zones, settlements)
    export.export_all(args.out, zones, buildings, roads, settlement_rows, infra, {
        'event': args.event, 'method': method,
        'osm_snapshot': C.OSM_SNAPSHOT, 'osm_source': sorted(set(fetch_osm.SOURCES.values())), 'before': scenes.get('pre'), 'after': scenes.get('post'),
    })
    # The DEM the dashboard's flood-path tool traces on
    floodpath.export_dem(args.out, [float(v) for v in args.bbox.split(',')])
    print(json.dumps({
        'zones': len(zones),
        'flooded_km2': float(zones.loc[zones['type'].isin(['water', 'debris']), 'area_km2'].sum()),
        'buildings_damaged': int(buildings['damaged'].sum()),
        'roads_damaged': int(roads['damaged'].sum()),
        'cut_off': [k for k, v in status.items() if v is False],
        'unknown': [k for k, v in status.items() if v is None],
    }, indent=2))


if __name__ == '__main__':
    main()
