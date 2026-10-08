import geopandas as gpd
from shapely.geometry import LineString, Point, box

import export
import osm_quality

# Roads and buildings in metres around Kathmandu's UTM zone, expressed back in degrees
LON, LAT = 85.3, 27.7
STEP = 0.001    # about 100 m


def road(*pairs):
    return LineString([(LON + x * STEP, LAT + y * STEP) for x, y in pairs])


def building(x, y):
    return box(LON + x * STEP, LAT + y * STEP, LON + x * STEP + 0.0001, LAT + y * STEP + 0.0001)


def frame(geoms, **columns):
    return gpd.GeoDataFrame(columns, geometry=geoms, crs='EPSG:4326')


def test_counts_buildings_near_a_road_and_settlements_with_no_road():
    roads = frame([road((0, 0), (10, 0))])
    buildings = frame([building(2, 1), building(5, -1), building(5, 40)])     # two beside the road, one 4 km away
    result = osm_quality.summarise(buildings, roads, {'s1': True, 's2': False, 's3': None, 's4': None})
    assert result['buildings'] == 3
    assert result['buildings_near_road'] == round(2 / 3, 3)
    assert result['settlements'] == 4 and result['settlements_without_road'] == 2
    assert 0.9 < result['road_km'] < 1.2


def test_no_roads_at_all_is_reported_as_nothing_near_a_road_not_as_an_error():
    result = osm_quality.summarise(frame([building(1, 1)]), frame([]), {'s1': None})
    assert result['buildings_near_road'] == 0.0
    assert result['road_km'] is None
    assert result['settlements_without_road'] == 1


def test_no_buildings_gives_no_share():
    result = osm_quality.summarise(frame([]), frame([road((0, 0), (1, 0))]), {})
    assert result['buildings_near_road'] is None


def test_the_published_roads_keep_their_class_and_one_way_tags(tmp_path):
    roads = gpd.GeoDataFrame(
        {'name': ['Pasang Lhamu Highway', 'Lane'], 'damaged': [False, True], 'length_km': [1.0, 0.2],
         'highway': ['trunk', 'residential'], 'oneway': ['yes', None], 'surface': ['asphalt', None], 'lanes': ['2', '1']},
        geometry=[road((0, 0), (10, 0)), road((0, 1), (3, 1))], crs='EPSG:4326')
    zones = gpd.GeoDataFrame({'id': [], 'type': [], 'confidence': [], 'area_km2': []}, geometry=[], crs='EPSG:4326')
    buildings = gpd.GeoDataFrame({'settlement_id': [], 'damaged': []}, geometry=[], crs='EPSG:4326')
    export.export_all(tmp_path, zones, buildings, roads, [], [], {})
    import json
    features = json.loads((tmp_path / 'roads.geojson').read_text(encoding='utf-8'))['features']
    assert features[0]['properties']['highway'] == 'trunk'
    assert features[0]['properties']['oneway'] == 'yes'
    assert features[0]['properties']['surface'] == 'asphalt'
    assert features[1]['properties']['oneway'] is None
    assert 'lanes' not in features[0]['properties']      # only the tags the dashboard reads
