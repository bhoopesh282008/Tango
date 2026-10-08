"""Write pipeline results in the shapes src/services/* expect."""
import json
from pathlib import Path

import config as C


ROAD_TAGS = ('highway', 'oneway', 'surface')


def _write(path, data):
    # allow_nan=False: a NaN would be written as a bare NaN, which browsers reject.
    Path(path).write_text(json.dumps(data, ensure_ascii=False, allow_nan=False, separators=(',', ':')),
                          encoding='utf-8')


def _rounded(coords):
    """Coordinates to 6 decimals (about 0.1 m), which trims the building file by about a sixth."""
    if isinstance(coords, (int, float)):
        return round(coords, 6)
    return [_rounded(c) for c in coords]


def _fc(gdf, columns):
    gdf = gdf.to_crs('EPSG:4326')
    collection = json.loads(gdf[columns + ['geometry']].to_json())
    collection.pop('crs', None)
    for feature in collection['features']:
        feature.pop('id', None)
        feature['geometry']['coordinates'] = _rounded(feature['geometry']['coordinates'])
    return collection


def export_all(out, zones, buildings, roads, settlements, infrastructure, satellite):
    """zones: id,type,confidence,area_km2. buildings: settlement_id,damaged.
    roads: name,damaged,length_km[,flooded_km]. settlements: id,name,lat,lng,population,connected.
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
    # flooded_km is absent from older callers; the dashboard then falls back to length_km.
    columns = ['id', 'name', 'damaged', 'length_km'] + (['flooded_km'] if 'flooded_km' in roads.columns else [])
    # Road class, one-way and surface as OpenStreetMap had them before the event: the dashboard's
    # router uses them for time estimates and to warn about one-way roads. Absent tags stay null.
    columns += [c for c in ROAD_TAGS if c in roads.columns]
    _write(out / 'roads.geojson', _fc(roads, columns))
    _write(out / 'settlements.json', settlements)
    _write(out / 'infrastructure.json', infrastructure)
    _write(out / 'satellite.json', satellite)
    _write(out / 'attribution.json', C.ATTRIBUTION)
