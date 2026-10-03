"""Trace where water released at a point would travel, from elevation alone.

    python floodpath.py --point 85.378,28.277 --bbox 85.1,27.9,85.5,28.3 --out out/

The trace expands outward from the point, always taking the lowest cell on its
frontier. That follows the valley floor and, unlike plain steepest descent,
climbs out of pits and DEM noise instead of stopping in them. It ends where the
path leaves the area. It is a drainage line, not a flood model: it says nothing
about depth, width, timing or how far a real flood would run.
"""
import argparse
import heapq
import json
from pathlib import Path

import geopandas as gpd
import numpy as np
from pyproj import Transformer
from shapely.geometry import LineString

NEIGHBOURS = [(-1, -1), (-1, 0), (-1, 1), (0, -1), (0, 1), (1, -1), (1, 0), (1, 1)]


def trace(height, start):
    """Cells (row, col) from `start` down to the edge of the grid."""
    rows, cols = height.shape
    parent = {start: None}
    frontier = [(float(height[start]), start)]
    while frontier:
        _, cell = heapq.heappop(frontier)
        r, c = cell
        if cell != start and (r in (0, rows - 1) or c in (0, cols - 1)):
            path = []
            while cell is not None:
                path.append(cell)
                cell = parent[cell]
            return path[::-1]
        for dr, dc in NEIGHBOURS:
            nxt = (r + dr, c + dc)
            if 0 <= nxt[0] < rows and 0 <= nxt[1] < cols and nxt not in parent:
                parent[nxt] = cell
                heapq.heappush(frontier, (float(height[nxt]), nxt))
    return [start]


def trace_from_point(height, xs, ys, crs, lon, lat):
    """Flood path from a lon/lat point as a LineString in `crs`."""
    x, y = Transformer.from_crs('EPSG:4326', crs, always_xy=True).transform(lon, lat)
    res = float(xs[1] - xs[0])
    col, row = int(round((x - xs[0]) / res)), int(round((ys[0] - y) / res))
    if not (0 <= row < len(ys) and 0 <= col < len(xs)):
        raise ValueError('The start point is outside the area')
    cells = trace(height, (row, col))
    if len(cells) < 2:
        raise ValueError('No downhill path from this point')
    return LineString([(xs[c], ys[r]) for r, c in cells])


def settlements_along(path, crs, settlements, within_m=500):
    """Settlements near the path, in downstream order.

    settlements: GeoDataFrame with id, name. Returns a list of dicts with the
    distance along the path (km) and the offset from it (m).
    """
    pts = settlements.to_crs(crs)
    rows = []
    for _, s in pts.iterrows():
        offset = path.distance(s.geometry)
        if offset <= within_m:
            rows.append({'id': s['id'], 'name': s['name'],
                         'distance_km': round(path.project(s.geometry) / 1000, 1),
                         'offset_m': round(offset)})
    return sorted(rows, key=lambda r: r['distance_km'])


# The dashboard traces paths in the browser from this file: heights as unsigned
# 16-bit integers in units of HEIGHT_UNIT metres, row by row from the north-west corner.
HEIGHT_UNIT = 0.2
DEM_STEP_DEG = 0.0003   # about 30 m


def export_dem(out, bbox, step=DEM_STEP_DEG):
    """Write dem.bin and dem.json for the dashboard's flood-path tool."""
    import fetch_dem

    west, south, east, north = bbox
    xs = west + step * (np.arange(int(round((east - west) / step))) + 0.5)
    ys = north - step * (np.arange(int(round((north - south) / step))) + 0.5)
    height = fetch_dem.fetch('EPSG:4326', xs, ys)
    encoded = np.clip(np.round(height / HEIGHT_UNIT), 0, 65535).astype('<u2')
    out = Path(out)
    out.mkdir(parents=True, exist_ok=True)
    (out / 'dem.bin').write_bytes(encoded.tobytes())
    (out / 'dem.json').write_text(json.dumps({
        'west': west, 'north': north, 'step': step, 'width': len(xs), 'height': len(ys),
        'unit_m': HEIGHT_UNIT, 'source': 'Copernicus DEM GLO-30',
    }), encoding='utf-8')
    return encoded.shape


def main():
    import fetch_dem
    import fetch_osm
    import preprocess_s1 as P
    from run import settlements_from_places

    ap = argparse.ArgumentParser()
    ap.add_argument('--point', help='lon,lat of the release point')
    ap.add_argument('--export-dem', action='store_true', help='write dem.bin / dem.json for the dashboard and stop')
    ap.add_argument('--bbox', required=True, help='W,S,E,N')
    ap.add_argument('--out', default='out')
    args = ap.parse_args()

    if args.export_dem:
        print('dem grid', export_dem(args.out, [float(v) for v in args.bbox.split(',')]))
        return
    if not args.point:
        ap.error('--point is required unless --export-dem is given')
    lon, lat = (float(v) for v in args.point.split(','))
    crs, xs, ys = P.make_grid([float(v) for v in args.bbox.split(',')], res=30.0)
    path = trace_from_point(fetch_dem.fetch(crs, xs, ys), xs, ys, crs, lon, lat)
    settlements = settlements_from_places(fetch_osm.fetch_layer('places', args.bbox))
    along = settlements_along(path, crs, settlements)

    out = Path(args.out)
    out.mkdir(parents=True, exist_ok=True)
    line = gpd.GeoDataFrame({'length_km': [round(path.length / 1000, 1)]}, geometry=[path], crs=crs)
    feature = json.loads(line.to_crs('EPSG:4326').to_json())
    feature['settlements'] = along
    (out / 'flood_path.geojson').write_text(json.dumps(feature, ensure_ascii=False), encoding='utf-8')
    print(json.dumps({'length_km': round(path.length / 1000, 1), 'settlements': along}, indent=2, ensure_ascii=False))


if __name__ == '__main__':
    main()
