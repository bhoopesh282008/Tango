"""Pre-event OpenStreetMap snapshot.

The ohsome API is asked first. If it refuses the extraction (it has answered
HTTP 403 on its geometry endpoints), the same snapshot is taken from the
Overpass API with a date setting. Either way the data is OSM as it was on the
snapshot date; SOURCES records which service supplied each layer.
"""
import json
import time

import geopandas as gpd
import requests

import config as C

FILTERS = {
    'buildings': 'building=* and geometry:polygon',
    'roads': 'highway in (motorway, trunk, primary, secondary, tertiary, unclassified, '
             'residential, track, service) and geometry:line',
    'bridges': 'bridge=yes and geometry:line',
    # Often mapped as areas, so polygons are kept and reduced to a point later.
    'health': '(amenity in (hospital, clinic, doctors) or healthcare=*) and (geometry:point or geometry:polygon)',
    'places': 'place in (city, town, village, hamlet) and (geometry:point or geometry:polygon)',
    'waterways': 'waterway in (river, stream) and geometry:line',
}

OVERPASS_URL = 'https://overpass-api.de/api/interpreter'
ROAD_CLASSES = 'motorway|trunk|primary|secondary|tertiary|unclassified|residential|track|service'
# Per layer: Overpass statements ({b} is the bbox) and whether closed ways are areas.
OVERPASS = {
    'buildings': (['way["building"]({b});'], True),
    'roads': ([f'way["highway"~"^({ROAD_CLASSES})$"]({{b}});'], False),
    'bridges': (['way["bridge"="yes"]({b});'], False),
    'health': (['node["amenity"~"^(hospital|clinic|doctors)$"]({b});', 'way["amenity"~"^(hospital|clinic|doctors)$"]({b});',
                'node["healthcare"]({b});', 'way["healthcare"]({b});'], True),
    'places': (['node["place"~"^(city|town|village|hamlet)$"]({b});',
                'way["place"~"^(city|town|village|hamlet)$"]({b});'], True),
    'waterways': (['way["waterway"~"^(river|stream)$"]({b});'], False),
}

# layer -> 'ohsome' or 'overpass', filled as layers are fetched
SOURCES = {}


class OhsomeRefused(RuntimeError):
    pass


def _ohsome(name, bbox, snapshot):
    response = requests.post(
        f'{C.OHSOME_URL}/elements/geometry',
        data={'bboxes': bbox, 'time': snapshot, 'filter': FILTERS[name], 'properties': 'tags'},
        timeout=300,
    )
    if response.status_code == 403:
        raise OhsomeRefused('ohsome refused the geometry extraction request (HTTP 403)')
    response.raise_for_status()
    return response.json()


def overpass_to_geojson(elements, areas):
    """Overpass `out geom` elements -> GeoJSON features. Relations are skipped."""
    features, seen = [], set()
    for el in elements:
        key = (el['type'], el['id'])
        if key in seen:
            continue
        seen.add(key)
        if el['type'] == 'node':
            geometry = {'type': 'Point', 'coordinates': [el['lon'], el['lat']]}
        elif el['type'] == 'way' and len(el.get('geometry', [])) >= 2:
            coords = [[p['lon'], p['lat']] for p in el['geometry']]
            closed = len(coords) >= 4 and coords[0] == coords[-1]
            geometry = ({'type': 'Polygon', 'coordinates': [coords]} if areas and closed
                        else {'type': 'LineString', 'coordinates': coords})
        else:
            continue
        features.append({'type': 'Feature', 'geometry': geometry,
                         'properties': {'@osmId': f"{el['type']}/{el['id']}", **el.get('tags', {})}})
    return {'type': 'FeatureCollection', 'features': features}


def _overpass(name, bbox, snapshot):
    west, south, east, north = bbox.split(',')
    statements, areas = OVERPASS[name]
    box = f'{south},{west},{north},{east}'
    query = (f'[out:json][timeout:300][date:"{snapshot}T00:00:00Z"];('
             + ''.join(s.format(b=box) for s in statements) + ');out geom;')
    # The public server sheds load with 429 / 504; wait and try again a few times.
    for wait in (15, 30, 60, None):
        response = requests.post(OVERPASS_URL, data={'data': query}, timeout=360,
                                 headers={'User-Agent': 'tango-flood-pipeline (educational prototype)'})
        if response.status_code not in (429, 502, 503, 504) or wait is None:
            break
        time.sleep(wait)
    response.raise_for_status()
    return overpass_to_geojson(response.json()['elements'], areas)


def _read(path):
    data = json.loads(path.read_text(encoding='utf-8'))
    if not data['features']:
        return gpd.GeoDataFrame({'geometry': []}, geometry='geometry', crs='EPSG:4326')
    return gpd.GeoDataFrame.from_features(data['features'], crs='EPSG:4326')


def fetch_layer(name, bbox, snapshot=C.OSM_SNAPSHOT, use_cache=True):
    """GeoDataFrame of one layer at `snapshot` (YYYY-MM-DD). bbox = W,S,E,N."""
    if snapshot >= '2026-08-26':
        raise ValueError('OSM snapshot must predate the event (brief: pre-26 Aug 2026 only)')
    folder = C.CACHE / 'osm'
    stem = f'{name}_{snapshot}_{bbox.replace(",", "_")}'
    if use_cache:
        for source in ('ohsome', 'overpass'):
            cache = folder / f'{stem}_{source}.geojson'
            if cache.exists():
                SOURCES[name] = source
                return _read(cache)
    try:
        data, source = _ohsome(name, bbox, snapshot), 'ohsome'
    except OhsomeRefused:
        data, source = _overpass(name, bbox, snapshot), 'overpass'
    folder.mkdir(parents=True, exist_ok=True)
    cache = folder / f'{stem}_{source}.geojson'
    cache.write_text(json.dumps(data), encoding='utf-8')
    SOURCES[name] = source
    return _read(cache)


# Layers the run can do without: the valley-floor mask falls back to the DEM.
OPTIONAL = ('waterways',)


def fetch_all(bbox, snapshot=C.OSM_SNAPSHOT):
    layers = {}
    for name in FILTERS:
        try:
            layers[name] = fetch_layer(name, bbox, snapshot)
        except requests.RequestException:
            if name not in OPTIONAL:
                raise
            layers[name], SOURCES[name] = None, 'unavailable'
    return layers
