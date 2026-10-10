import geopandas as gpd
from shapely.geometry import LineString, Point

import run


def places(rows):
    return gpd.GeoDataFrame(
        [{'name': n, 'place': kind, 'geometry': Point(x, 28.0)} for n, kind, x in rows], crs='EPSG:4326')


def test_places_keep_what_kind_of_place_they_are():
    s = run.settlements_from_places(places([('Dhunche', 'town', 85.0), ('Bhainse', 'village', 85.1)]))
    assert list(s['place']) == ['town', 'village']
    assert list(run.towns_of(s)['name']) == ['Dhunche']
    assert run.towns_of(run.settlements_from_places(places([('Bhainse', 'village', 85.1)]))).empty


def test_a_settlement_can_lose_the_road_to_the_hospital_and_keep_the_road_to_a_town():
    # A (town) --- B --- C (hospital) --- D: the road between B and C is damaged, the rest is open.
    roads = gpd.GeoDataFrame({'damaged': [False, True, False]}, geometry=[
        LineString([(85.00, 28.0), (85.05, 28.0)]), LineString([(85.05, 28.0), (85.10, 28.0)]),
        LineString([(85.10, 28.0), (85.12, 28.0)])], crs='EPSG:4326')
    s = run.settlements_from_places(places([('Dhunche', 'town', 85.00), ('Bhainse', 'village', 85.049), ('Chilime', 'village', 85.10)]))
    hospital = gpd.GeoDataFrame(geometry=[Point(85.10, 28.0)], crs='EPSG:4326')
    hospital_status = run.cutoff.connectivity(s, hospital, roads)
    town_status = run.cutoff.connectivity(s, run.towns_of(s), roads)
    by_name = {n: (hospital_status[i], town_status[i]) for n, i in zip(s['name'], s['id'])}
    assert by_name['Bhainse'] == (False, True)       # cut off from the hospital, the town is still open
    assert by_name['Chilime'] == (True, False)       # the hospital is there, the town is not reachable
    rows = run.settlement_records(s, hospital_status, town_status)
    assert [r['town_connected'] for r in rows] == [True, True, False]


def test_a_run_with_no_town_mapped_has_no_town_answer_rather_than_a_wrong_one():
    s = run.settlements_from_places(places([('Bhainse', 'village', 85.049)]))
    rows = run.settlement_records(s, {s['id'][0]: False})
    assert rows[0]['town_connected'] is None and rows[0]['connected'] is False
