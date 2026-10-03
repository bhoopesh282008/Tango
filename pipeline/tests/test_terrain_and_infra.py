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


def test_export_dem_writes_a_grid_the_dashboard_can_read(tmp_path, monkeypatch):
    import json
    import fetch_dem

    seen = {}

    def fake_fetch(crs, xs, ys):
        seen.update(crs=crs, xs=xs, ys=ys)
        return np.full((len(ys), len(xs)), 1234.5, 'float32')

    monkeypatch.setattr(fetch_dem, 'fetch', fake_fetch)
    shape = floodpath.export_dem(tmp_path, [85.0, 28.0, 85.03, 28.06], step=0.01)
    meta = json.loads((tmp_path / 'dem.json').read_text())
    cells = np.fromfile(tmp_path / 'dem.bin', '<u2')

    assert shape == (6, 3) and (meta['width'], meta['height']) == (3, 6)
    assert cells.size == 18 and abs(cells[0] * meta['unit_m'] - 1234.5) < meta['unit_m']
    # Cell centres, rows from the north.
    assert seen['crs'] == 'EPSG:4326' and abs(seen['xs'][0] - 85.005) < 1e-9
    assert seen['ys'][0] > seen['ys'][-1] and abs(seen['ys'][0] - 28.055) < 1e-9


def test_unnamed_roads_are_described_by_kind_and_nearest_settlement():
    x0, y0 = 500000, 3000000
    roads = gpd.GeoDataFrame(
        {'name': ['Pasang Lhamu Highway', np.nan, np.nan, np.nan],
         'highway': ['primary', 'track', 'unclassified', 'tertiary'],
         'ref': [np.nan, np.nan, 'F021', np.nan]},
        geometry=[LineString([(x0, y0), (x0 + 1000, y0)]), LineString([(x0, y0 + 50), (x0 + 100, y0 + 50)]),
                  LineString([(x0, y0), (x0, y0 + 500)]), LineString([(x0 + 9000, y0), (x0 + 9500, y0)])],
        crs=CRS)
    settlements = gpd.GeoDataFrame({'id': ['a', 'b'], 'name': ['Lingling', 'Thade']},
                                   geometry=[Point(x0, y0), Point(x0 + 9000, y0)], crs=CRS)
    described = run.describe_roads(roads, settlements)
    assert described['name'].tolist() == [
        'Pasang Lhamu Highway', 'Unnamed track near Lingling', 'Road F021', 'Unnamed tertiary road near Thade']
    assert described['length_km'].tolist() == [1.0, 0.1, 0.5, 0.5]
    # Without settlements the kind is still given.
    assert run.describe_roads(roads)['name'][1] == 'Unnamed track'


def v_valley(rows=120, cols=90, cell=10.0):
    """A V-shaped valley draining south along the middle column."""
    return (2000 - 2.0 * np.arange(rows)[:, None] + 0.5 * cell * np.abs(np.arange(cols) - cols // 2)[None, :]).astype('float32')


def test_height_above_drainage_and_valley_floor_from_a_waterway():
    import terrain
    from rasterio.transform import from_origin
    height, cell = v_valley(), 10.0
    transform = from_origin(500000, 3100000, cell, cell)
    river = gpd.GeoDataFrame(geometry=[LineString([(500000 + 45.5 * cell, 3100000), (500000 + 45.5 * cell, 3100000 - 120 * cell)])], crs=CRS)
    drainage = terrain.drainage_from_waterways(river, transform, height.shape, CRS)
    assert drainage[:, 45].all() and not drainage[:, 30].any()
    hand, distance = terrain.height_above_drainage(height, drainage, cell)
    assert hand[60, 45] == 0 and abs(hand[60, 49] - 20) < 1e-3 and abs(distance[60, 49] - 40) < 1e-3
    floor, source = terrain.valley_floor(height, cell, river, transform, CRS, max_height_m=30)
    assert source == 'OpenStreetMap waterways'
    assert floor[60, 45] and floor[60, 51] and not floor[60, 52]        # 30 m above the river is 6 cells out


def test_drainage_falls_back_to_the_dem_when_no_waterway_is_mapped():
    import terrain
    height = v_valley(300, 240)
    floor, source = terrain.valley_floor(height, 10.0)
    assert source == 'DEM-derived channels'
    channels = terrain.drainage_from_dem(height, 10.0)
    assert channels[250:, 117:123].any() and not channels[:, :60].any()   # a channel forms down the valley axis only
    assert floor[280, 120] and not floor[280, 20]
    hand, distance = terrain.height_above_drainage(height, np.zeros(height.shape, bool), 10.0)
    assert np.isinf(hand).all() and np.isinf(distance).all()


def test_classification_on_the_floor_keeps_floods_and_drops_slope_speckle():
    import config as C
    import segment
    rng = np.random.default_rng(1)
    pre = rng.normal(-8, 0.6, (120, 90)).astype('float32')
    post = pre + rng.normal(0, 0.6, pre.shape).astype('float32')
    floor = np.zeros(pre.shape, bool)
    floor[:, 40:51] = True
    post[20:40, 42:48] -= 6          # new water on the floor; -14 dB, never "open water" dark
    post[60:80, 42:48] += 6          # debris on the floor
    post[10:12, 5:7] -= 9            # a speck on a slope: ignored
    post[90:105, 10:25] += 8         # a hectare of strong change on a slope: flagged, not called flood
    post[0, 0] = np.nan
    classes, conf = segment.classify(pre, post, floor=floor)
    assert (classes[22:38, 43:47] == C.CLASS_WATER).all() and conf[30, 45] > 0.6
    assert (classes[62:78, 43:47] == C.CLASS_DEBRIS).all()
    assert (classes[8:14, 3:9] == 0).all()
    assert (classes[92:103, 12:23] == C.CLASS_UNCERTAIN).all()
    assert classes[0, 0] == 0
    untouched = np.ones(pre.shape, bool)
    for rows, cols in ((slice(18, 42), slice(40, 51)), (slice(58, 82), slice(40, 51)), (slice(88, 107), slice(8, 27))):
        untouched[rows, cols] = False
    assert (classes[untouched] == 0).mean() > 0.999          # noise alone raises almost nothing
    # Without a floor mask the original rules still apply, and reject this water as not dark enough.
    old, _ = segment.classify(pre, post)
    assert (old[22:38, 43:47] != C.CLASS_WATER).all()
