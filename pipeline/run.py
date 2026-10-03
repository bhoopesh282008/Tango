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


def prepare_pair(bbox, event, out, res=10.0, pol='vv'):
    """Raw GRD scenes -> co-registered dB rasters. Returns paths and scene metadata."""
    out = Path(out)
    out.mkdir(parents=True, exist_ok=True)
    before, after = fetch_s1.find_pair(bbox, event)
    crs, xs, ys = P.make_grid([float(v) for v in bbox.split(',')], res)
    transform = fetch_dem.grid_transform(xs, ys)
    height = fetch_dem.fetch(crs, xs, ys)

    paths, meta, slope = {}, {}, None
    for label, item in (('pre', before), ('post', after)):
        scene = download.get_scene(item, pol)
        ann = P.parse_annotation(scene.product_xml)
        geo = P.geocode(ann, crs, xs, ys, height)
        window = P.radar_window(geo, ann)
        db = P.terrain_correct(download.read_window(scene, window), window, geo,
                               P.parse_calibration(scene.calibration_xml),
                               P.parse_noise(scene.noise_xml))
        paths[label] = out / f'{label}_{pol}_db.tif'
        write_raster(paths[label], db, crs, transform)
        slope = geo['slope_deg']
        meta[label] = {
            'id': item.id, 'date': item.properties['datetime'][:10],
            'sensor': f"Sentinel-1 GRD ({pol.upper()})", 'resolution': f'{res:.0f} m',
            'relative_orbit': item.properties.get('sat:relative_orbit'),
            'orbit_state': item.properties.get('sat:orbit_state'),
            'geolocation_check_px': P.check_geolocation(ann),
            'masked_fraction': round(float((geo['layover'] | geo['shadow']).mean()), 3),
        }
    paths['slope'] = out / 'slope.tif'
    write_raster(paths['slope'], slope, crs, transform)
    return paths, meta


def settlements_from_places(places, hospitals):
    """OSM places -> settlement table. Population only where OSM carries it."""
    rows = []
    for i, (_, p) in enumerate(places.iterrows()):
        name = p.get('name')
        if not name:
            continue
        try:
            population = int(p.get('population') or 0) or None
        except (TypeError, ValueError):
            population = None
        rows.append({'id': f's{i + 1:03d}', 'name': name, 'name_np': p.get('name:ne'),
                     'lat': p.geometry.y, 'lng': p.geometry.x, 'population': population,
                     'geometry': p.geometry})
    return gpd.GeoDataFrame(rows, geometry='geometry', crs=places.crs)


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument('--bbox', required=True, help='W,S,E,N')
    ap.add_argument('--pre', help='existing terrain-corrected VV dB raster (skips the satellite steps)')
    ap.add_argument('--post')
    ap.add_argument('--event', required=True)
    ap.add_argument('--slope', help='optional slope raster (degrees) on the same grid')
    ap.add_argument('--out', default=str(C.OUT))
    args = ap.parse_args()

    scenes = {}
    if not (args.pre and args.post):
        paths, scenes = prepare_pair(args.bbox, args.event, Path(args.out) / 'rasters')
        args.pre, args.post, args.slope = str(paths['pre']), str(paths['post']), str(paths['slope'])

    pre, transform, crs = read_db(args.pre)
    post, _, _ = read_db(args.post)
    slope = read_db(args.slope)[0] if args.slope else None

    classes, conf = segment.classify(pre, post, slope)
    zones = segment.vectorise(classes, conf, transform, crs)

    osm = fetch_osm.fetch_all(args.bbox)
    roads = damage.flag_damaged(osm['roads'], zones)
    buildings = damage.flag_damaged(osm['buildings'], zones)
    settlements = settlements_from_places(osm['places'], osm['health'])
    buildings = damage.assign_settlement(buildings, settlements)

    hospitals = osm['health'][osm['health'].get('amenity', '') == 'hospital']
    status = cutoff.connectivity(settlements, hospitals if len(hospitals) else osm['health'], roads)

    metric = roads.to_crs(roads.estimate_utm_crs())
    roads['length_km'] = (metric.length / 1000).round(2).to_numpy()
    roads['name'] = roads.get('name', '').fillna('Unnamed road') if 'name' in roads else 'Unnamed road'

    settlement_rows = [
        {k: v for k, v in s.items() if k != 'geometry'} | {'connected': status[s['id']]}
        for s in settlements.to_dict('records')
    ]
    export.export_all(args.out, zones, buildings, roads, settlement_rows, [], {
        'event': args.event, 'method': 'Sentinel-1 change detection (baseline thresholds)',
        'osm_snapshot': C.OSM_SNAPSHOT, 'before': scenes.get('pre'), 'after': scenes.get('post'),
    })
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
