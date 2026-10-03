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
import export
import fetch_osm
import segment


def read_db(path):
    with rasterio.open(path) as src:
        return src.read(1).astype('float32'), src.transform, src.crs


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
    ap.add_argument('--pre', required=True)
    ap.add_argument('--post', required=True)
    ap.add_argument('--event', required=True)
    ap.add_argument('--slope', help='optional slope raster (degrees) on the same grid')
    ap.add_argument('--out', default=str(C.OUT))
    args = ap.parse_args()

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
        'osm_snapshot': C.OSM_SNAPSHOT,
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
