import sys
from pathlib import Path

import geopandas as gpd
import numpy as np
from shapely.geometry import LineString, Point, Polygon, box

sys.path.insert(0, str(Path(__file__).parent.parent))

import floodpath  # noqa: E402
import infrastructure  # noqa: E402
import run  # noqa: E402

CRS = 'EPSG:32645'


def valley():
    """Plane dropping to the south with a channel down column 10 and a pit in it."""
    rows, cols = 40, 21
    height = 1000 - 10.0 * np.arange(rows)[:, None] + 30.0 * np.abs(np.arange(cols) - 10)[None, :]
    height[15, 10] -= 200      # a pit in the channel bed
    return height


def test_trace_follows_the_channel_through_a_pit_to_the_edge():
    path = floodpath.trace(valley(), (2, 10))
    assert path[0] == (2, 10)
    assert path[-1][0] == 39                           # leaves at the southern edge
    assert (15, 10) in path                            # goes through the pit, and on
    assert all(abs(c - 10) <= 1 for _, c in path)      # stays in the channel
    assert [r for r, _ in path] == sorted(r for r, _ in path)


def test_trace_from_a_slope_joins_the_channel():
    path = floodpath.trace(valley(), (5, 18))
    assert path[-1][0] == 39 and abs(path[-1][1] - 10) <= 1


def test_settlements_along_path_are_listed_downstream():
    height = valley()
    xs = 500000 + 30.0 * np.arange(height.shape[1])
    ys = 3100000 - 30.0 * np.arange(height.shape[0])
    line = LineString([(xs[c], ys[r]) for r, c in floodpath.trace(height, (2, 10))])
    settlements = gpd.GeoDataFrame(
        {'id': ['low', 'far', 'high'], 'name': ['Low', 'Far', 'High']},
        geometry=[Point(xs[11], ys[30]), Point(xs[10] + 5000, ys[20]), Point(xs[9], ys[8])], crs=CRS)
    found = floodpath.settlements_along(line, CRS, settlements, within_m=200)
    assert [s['name'] for s in found] == ['High', 'Low']
    assert found[0]['distance_km'] < found[1]['distance_km']


def _network():
    # Road west to east: A(0) - B(1000) - C(2000) - D(3000); the middle section is flooded.
    x0, y0 = 500000, 3000000
    pts = [(x0 + i * 1000, y0) for i in range(4)]
    roads = gpd.GeoDataFrame({'damaged': [False, True, False, False]},
                             geometry=[LineString([pts[0], pts[1]]), LineString([pts[1], pts[2]]),
                                       LineString([pts[2], pts[3]]),
                                       LineString([pts[3], (x0 + 9000, y0)])], crs=CRS)
    zones = gpd.GeoDataFrame({'type': ['water']}, geometry=[box(x0 + 1400, y0 - 50, x0 + 1600, y0 + 50)], crs=CRS)
    settlements = gpd.GeoDataFrame({'id': ['west', 'east']}, geometry=[Point(pts[0]), Point(pts[3])], crs=CRS)
    return pts, roads, zones, settlements


def test_infrastructure_flags_bridges_in_zones_and_cut_off_health_posts():
    pts, roads, zones, settlements = _network()
    x0, y0 = pts[0]
    bridges = gpd.GeoDataFrame(
        {'name': ['Flooded bridge', np.nan]},
        geometry=[LineString([(x0 + 1450, y0), (x0 + 1550, y0)]), LineString([(x0 + 2400, y0), (x0 + 2500, y0)])],
        crs=CRS)
    health = gpd.GeoDataFrame(
        {'name': ['West post', 'East hospital', 'Off-road clinic']},
        geometry=[Point(pts[0]),
                  Polygon([(x0 + 2990, y0 - 10), (x0 + 3010, y0 - 10), (x0 + 3010, y0 + 10), (x0 + 2990, y0 + 10)]),
                  Point(x0, y0 + 20000)],
        crs=CRS)
    items = {i['name']: i for i in infrastructure.build(bridges, health, roads, zones, settlements)}

    assert items['Flooded bridge']['status'] == 'destroyed'
    assert items['Unnamed bridge']['status'] == 'operational'
    assert items['Unnamed bridge']['name_np'] is None
    # The larger remaining piece of the network is the eastern one.
    assert items['West post']['status'] == 'unreachable'
    assert items['East hospital']['status'] == 'operational'
    assert items['West post']['settlement_id'] == 'west'
    assert 'Off-road clinic' not in items            # not on the pre-event network: not assessed
    assert all(27 < i['lat'] < 28 and 84 < i['lng'] < 90 for i in items.values())


def test_settlements_from_places_handles_missing_tags_and_areas():
    places = gpd.GeoDataFrame(
        {'name': ['Dhunche', np.nan, 'Ramche'], 'population': ['2,744', '10', np.nan]},
        geometry=[Point(85.3, 28.1), Point(85.2, 28.0), box(85.25, 28.05, 85.26, 28.06)], crs='EPSG:4326')
    s = run.settlements_from_places(places)
    assert s['name'].tolist() == ['Dhunche', 'Ramche']            # unnamed place dropped
    assert s['population'].tolist()[0] == 2744
    assert s['population'].isna().tolist() == [False, True]
    assert s.geometry.geom_type.tolist() == ['Point', 'Point']
    assert s['name_np'].tolist() == [None, None]                   # no name:ne column at all


def test_hospitals_or_any_without_an_amenity_column():
    health = gpd.GeoDataFrame({'healthcare': ['clinic']}, geometry=[Point(85.3, 28.1)], crs='EPSG:4326')
    assert len(run.hospitals_or_any(health)) == 1


def test_names_prefer_english_and_reuse_a_devanagari_name_as_nepali():
    assert run.names({'name': 'धुन्चे', 'name:en': 'Dhunche'}) == ('Dhunche', 'धुन्चे')
    assert run.names({'name': 'धुन्चे'}) == ('धुन्चे', 'धुन्चे')
    assert run.names({'name': 'Ramche', 'name:ne': 'राम्चे'}) == ('Ramche', 'राम्चे')
    assert run.names({'name': np.nan}) == (None, None)


def test_overpass_elements_become_points_lines_and_polygons():
    import fetch_osm
    square = [{'lat': 0, 'lon': 0}, {'lat': 0, 'lon': 1}, {'lat': 1, 'lon': 1}, {'lat': 0, 'lon': 0}]
    elements = [
        {'type': 'node', 'id': 1, 'lat': 28.1, 'lon': 85.3, 'tags': {'place': 'village', 'name': 'A'}},
        {'type': 'way', 'id': 2, 'geometry': square, 'tags': {'building': 'yes'}},
        {'type': 'way', 'id': 2, 'geometry': square, 'tags': {'building': 'yes'}},   # duplicate
        {'type': 'way', 'id': 3, 'geometry': square[:2]},
        {'type': 'relation', 'id': 4, 'members': []},
    ]
    as_areas = fetch_osm.overpass_to_geojson(elements, areas=True)['features']
    assert [f['geometry']['type'] for f in as_areas] == ['Point', 'Polygon', 'LineString']
    assert as_areas[0]['properties'] == {'@osmId': 'node/1', 'place': 'village', 'name': 'A'}
    assert as_areas[0]['geometry']['coordinates'] == [85.3, 28.1]
    # A closed road (a roundabout) stays a line.
    as_lines = fetch_osm.overpass_to_geojson(elements, areas=False)['features']
    assert as_lines[1]['geometry']['type'] == 'LineString'


def test_post_event_snapshot_is_refused():
    import fetch_osm
    import pytest
    with pytest.raises(ValueError):
        fetch_osm.fetch_layer('roads', '85.1,27.9,85.5,28.3', snapshot='2026-08-27')


def test_settlement_records_are_valid_json():
    import json
    places = gpd.GeoDataFrame(
        {'name': ['Dhunche', 'Ramche'], 'population': ['2744', np.nan]},
        geometry=[Point(85.3, 28.1), Point(85.2, 28.0)], crs='EPSG:4326')
    s = run.settlements_from_places(places)
    rows = run.settlement_records(s, {s['id'][0]: True, s['id'][1]: None})
    json.dumps(rows, allow_nan=False)
    assert rows[0]['population'] == 2744 and rows[1]['population'] is None
    assert rows[1]['name_np'] is None and rows[1]['connected'] is None


def test_export_rounds_coordinates_and_keeps_flags(tmp_path):
    import json
    import export
    zones = gpd.GeoDataFrame({'id': ['z001'], 'type': ['water'], 'confidence': [0.7], 'area_km2': [1.0]},
                             geometry=[box(85.3, 28.1, 85.31, 28.11)], crs='EPSG:4326')
    buildings = gpd.GeoDataFrame({'settlement_id': ['s001', 's001'], 'damaged': [True, False], 'name': ['x', np.nan]},
                                 geometry=[box(85.30000012345, 28.1, 85.3001, 28.1001), box(85.4, 28.2, 85.4001, 28.2001)],
                                 crs='EPSG:4326')
    roads = gpd.GeoDataFrame({'name': ['A'], 'damaged': [True], 'length_km': [1.2]},
                             geometry=[LineString([(85.3, 28.1), (85.31, 28.11)])], crs='EPSG:4326')
    export.export_all(tmp_path, zones, buildings, roads, [], [], {})
    out = json.loads((tmp_path / 'buildings.geojson').read_text(encoding='utf-8'))
    assert [f['properties'] for f in out['features']] == [
        {'settlement_id': 's001', 'damaged': True}, {'settlement_id': 's001', 'damaged': False}]
    xs = [c[0] for f in out['features'] for c in f['geometry']['coordinates'][0]]
    assert all(round(x, 6) == x for x in xs) and 85.3 in xs
    assert json.loads((tmp_path / 'roads.geojson').read_text(encoding='utf-8'))['features'][0]['properties']['id'] == 'r0001'


def test_synthetic_fixture_zone_is_labelled_and_follows_the_path():
    import dev_fixture
    path = LineString([(500000, 3100000), (500000, 3099000)])
    zones = dev_fixture.synthetic_zones(path, CRS, width_m=150)
    assert len(zones) == 1 and zones.geometry[0].contains(Point(500100, 3099500))
    assert not zones.geometry[0].contains(Point(500200, 3099500))
    assert 'SYNTHETIC' in dev_fixture.METHOD and 'not a result' in dev_fixture.METHOD
