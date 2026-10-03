"""Write pipeline results in the shapes src/services/* expect."""
import json
from pathlib import Path

import config as C


def _write(path, data):
    # allow_nan=False: a NaN would be written as a bare NaN, which browsers reject.
    Path(path).write_text(json.dumps(data, ensure_ascii=False, allow_nan=False), encoding='utf-8')


def _fc(gdf, columns):
    gdf = gdf.to_crs('EPSG:4326')
    return json.loads(gdf[columns + ['geometry']].to_json())


def export_all(out, zones, buildings, roads, settlements, infrastructure, satellite):
    """zones: id,type,confidence,area_km2. buildings: settlement_id,damaged.
    roads: name,damaged,length_km. settlements: id,name,lat,lng,population,connected.
    infrastructure: list of dicts. satellite: before/after metadata dict."""
    out = Path(out)
    out.mkdir(parents=True, exist_ok=True)
    zones = zones.copy()
    # Built row by row so that a run which finds no flood (no rows) still exports.
    zones['name'] = [f'{t.capitalize()} {i}' for t, i in zip(zones['type'], zones['id'])]
    _write(out / 'flood_zones.geojson', _fc(zones, ['id', 'name', 'type', 'confidence', 'area_km2']))
    _write(out / 'buildings.geojson', _fc(buildings, ['settlement_id', 'damaged']))
    roads = roads.copy()
    roads['id'] = [f'r{i + 1:04d}' for i in range(len(roads))]
    _write(out / 'roads.geojson', _fc(roads, ['id', 'name', 'damaged', 'length_km']))
    _write(out / 'settlements.json', settlements)
    _write(out / 'infrastructure.json', infrastructure)
    _write(out / 'satellite.json', satellite)
    _write(out / 'attribution.json', C.ATTRIBUTION)
