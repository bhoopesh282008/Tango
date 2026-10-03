"""Real-scale test data for the dashboard, with a SYNTHETIC flood. Not a result.

    python dev_fixture.py --bbox 85.1,27.9,85.5,28.3 --point 85.378,28.277 --out ../public/data

Everything except the flood is real: OpenStreetMap buildings, roads, bridges,
health facilities and settlements, run through the same damage, cut-off,
infrastructure and export steps as a real run. The flood zone is made up: a
buffer around the drainage path traced on the DEM from --point. It exists to
exercise the dashboard at realistic volumes before any Sentinel-1 scene has
been processed. The output says so in satellite.json and must never be shown
as a flood map.
"""
import argparse
import json

import geopandas as gpd

import cutoff
import damage
import export
import fetch_dem
import fetch_osm
import floodpath
import infrastructure
import preprocess_s1 as P
import run

METHOD = 'SYNTHETIC TEST FLOOD, not a result'


def synthetic_zones(path, crs, width_m=150):
    """One made-up 'water' zone: the path buffered by width_m."""
    zone = path.buffer(width_m)
    return gpd.GeoDataFrame(
        {'id': ['z001'], 'type': ['water'], 'confidence': [0.6], 'area_km2': [round(zone.area / 1e6, 3)]},
        geometry=[zone], crs=crs,
    )


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument('--bbox', required=True)
    ap.add_argument('--point', required=True, help='lon,lat where the made-up flood starts')
    ap.add_argument('--out', required=True)
    args = ap.parse_args()

    lon, lat = (float(v) for v in args.point.split(','))
    crs, xs, ys = P.make_grid([float(v) for v in args.bbox.split(',')], res=30.0)
    path = floodpath.trace_from_point(fetch_dem.fetch(crs, xs, ys), xs, ys, crs, lon, lat)
    zones = synthetic_zones(path, crs)

    osm = fetch_osm.fetch_all(args.bbox)
    roads = damage.flag_damaged(osm['roads'], zones.to_crs(osm['roads'].crs))
    buildings = damage.flag_damaged(osm['buildings'], zones.to_crs(osm['buildings'].crs))
    settlements = run.settlements_from_places(osm['places'])
    buildings = damage.assign_settlement(buildings, settlements)
    status = cutoff.connectivity(settlements, run.hospitals_or_any(osm['health']), roads)
    roads = run.describe_roads(roads)
    infra = infrastructure.build(osm['bridges'], osm['health'], roads, zones.to_crs(roads.crs), settlements)
    export.export_all(args.out, zones, buildings, roads, run.settlement_records(settlements, status), infra,
                      {'method': METHOD, 'osm_snapshot': fetch_osm.C.OSM_SNAPSHOT,
                       'osm_source': sorted(set(fetch_osm.SOURCES.values())), 'before': None, 'after': None})
    values = list(status.values())
    print(json.dumps({
        'method': METHOD, 'buildings': len(buildings), 'buildings_in_zone': int(buildings['damaged'].sum()),
        'road_segments': len(roads), 'roads_in_zone': int(roads['damaged'].sum()),
        'settlements': len(values), 'cut_off': values.count(False), 'unknown_access': values.count(None),
        'infrastructure': len(infra),
    }, indent=1))


if __name__ == '__main__':
    main()
