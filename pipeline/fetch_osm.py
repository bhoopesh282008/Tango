"""Pre-event OpenStreetMap snapshot through the ohsome API."""
import json

import geopandas as gpd
import requests

import config as C

FILTERS = {
    'buildings': 'building=* and geometry:polygon',
    'roads': 'highway in (motorway, trunk, primary, secondary, tertiary, unclassified, '
             'residential, track, service) and geometry:line',
    'bridges': 'bridge=yes and geometry:line',
    'health': '(amenity in (hospital, clinic, doctors) or healthcare=*) and geometry:point',
    'places': 'place in (city, town, village, hamlet) and geometry:point',
}


def fetch_layer(name, bbox, snapshot=C.OSM_SNAPSHOT, use_cache=True):
    """GeoDataFrame of one layer at `snapshot` (YYYY-MM-DD). bbox = W,S,E,N."""
    if snapshot >= '2026-08-26':
        raise ValueError('OSM snapshot must predate the event (brief: pre-26 Aug 2026 only)')
    cache = C.CACHE / 'osm' / f'{name}_{snapshot}_{bbox.replace(",", "_")}.geojson'
    if use_cache and cache.exists():
        return gpd.read_file(cache)
    response = requests.post(
        f'{C.OHSOME_URL}/elements/geometry',
        data={
            'bboxes': bbox,
            'time': snapshot,
            'filter': FILTERS[name],
            'properties': 'tags',
        },
        timeout=300,
    )
    response.raise_for_status()
    cache.parent.mkdir(parents=True, exist_ok=True)
    cache.write_text(json.dumps(response.json()), encoding='utf-8')
    return gpd.read_file(cache)


def fetch_all(bbox, snapshot=C.OSM_SNAPSHOT):
    return {name: fetch_layer(name, bbox, snapshot) for name in FILTERS}
