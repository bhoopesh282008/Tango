import sys
from pathlib import Path

import geopandas as gpd
from shapely.geometry import LineString, Point, box

sys.path.insert(0, str(Path(__file__).parent.parent))

import validate  # noqa: E402

CRS = 'EPSG:32645'
X, Y = 500000, 3100000


def _zones():
    # One 100 x 100 m water zone, one debris zone beside it, one uncertain zone far away.
    return gpd.GeoDataFrame(
        {'type': ['water', 'debris', 'uncertain']},
        geometry=[box(X, Y, X + 100, Y + 100), box(X + 100, Y, X + 200, Y + 100), box(X + 900, Y, X + 1000, Y + 100)],
        crs=CRS)


def test_compare_extent_counts_only_flood_classes():
    reference = gpd.GeoDataFrame(geometry=[box(X, Y, X + 400, Y + 100)], crs=CRS)
    result = validate.compare(_zones(), reference)
    assert result['mapped_km2'] == 0.02
    assert result['reference_km2'] == 0.04
    assert result['precision'] == 1.0
    assert result['recall'] == 0.5
    assert result['iou'] == 0.5


def test_compare_extent_is_limited_to_the_study_area():
    reference = gpd.GeoDataFrame(geometry=[box(X, Y, X + 400, Y + 100)], crs=CRS)
    result = validate.compare(_zones(), reference, within=box(X, Y, X + 100, Y + 100))
    assert result['mapped_km2'] == result['reference_km2'] == 0.01
    assert result['recall'] == 1.0


def test_compare_extent_with_nothing_mapped():
    reference = gpd.GeoDataFrame(geometry=[box(X, Y, X + 400, Y + 100)], crs=CRS)
    result = validate.compare(_zones(), reference, within=box(X + 300, Y, X + 400, Y + 100))
    assert result['precision'] is None      # nothing mapped: precision is undefined, not zero
    assert result['recall'] == 0.0


def test_study_area_excludes_what_the_reference_did_not_analyse():
    product = {
        'areaOfInterestA': gpd.GeoDataFrame(geometry=[box(X, Y, X + 1000, Y + 100)], crs=CRS),
        'notAnalysedA': gpd.GeoDataFrame(geometry=[box(X, Y, X + 100, Y + 100)], crs=CRS),
    }
    study, share = validate.study_area(product, box(X, Y, X + 500, Y + 100))
    assert share == 0.5
    assert abs(study.area - 400 * 100) < 1e-6


def test_compare_buildings():
    study = box(X, Y, X + 1000, Y + 100)
    built_up = gpd.GeoDataFrame(
        {'damage_gra': ['Destroyed', 'Damaged', 'Possibly damaged', 'Destroyed']},
        geometry=[Point(X + 50, Y + 50), Point(X + 205, Y + 50), Point(X + 500, Y + 50), Point(X + 5000, Y + 50)],
        crs=CRS)
    buildings = gpd.GeoDataFrame(
        {'damaged': [True, True, False]},
        geometry=[box(X + 45, Y + 45, X + 55, Y + 55), box(X + 700, Y + 40, X + 710, Y + 50),
                  box(X + 500, Y + 45, X + 510, Y + 55)],
        crs=CRS)
    result = validate.compare_buildings(buildings, _zones(), built_up, study)
    assert result['reference_affected'] == 3            # the fourth point is outside the study area
    assert result['reference_in_our_zones'] == 2        # the second is 5 m outside a zone, within one pixel
    assert result['recall'] == 0.667
    assert result['recall_destroyed_or_damaged'] == 1.0
    assert result['ours_flagged'] == 2
    assert result['ours_next_to_reference'] == 1
    assert result['precision'] == 0.5


def test_compare_roads():
    study = box(X, Y, X + 1000, Y + 100)
    roads = gpd.GeoDataFrame(
        {'damage_gra': ['Destroyed', 'Destroyed', 'No visible damage', 'No visible damage', 'Possibly damaged']},
        geometry=[LineString([(X + 50, Y), (X + 50, Y + 100)]), LineString([(X + 500, Y), (X + 500, Y + 100)]),
                  LineString([(X + 150, Y), (X + 150, Y + 100)]), LineString([(X + 600, Y), (X + 600, Y + 100)]),
                  LineString([(X + 60, Y), (X + 60, Y + 100)])],
        crs=CRS)
    result = validate.compare_roads(_zones(), roads, study)
    assert result['reference_destroyed_or_damaged'] == 2
    assert result['of_which_our_zones_touch'] == 1
    assert result['recall'] == 0.5
    assert result['false_alarm_rate'] == 0.5


def test_summary_takes_one_product_per_area_and_is_attached(tmp_path):
    def result(product, recall, precision, in_zones, affected):
        return {'product': product, 'extent': {'recall': recall, 'precision': precision},
                'buildings': {'reference_in_our_zones': in_zones, 'reference_affected': affected}}
    results = [
        result('EMSR927_AOI01_GRA_PRODUCT_v1', 0.04, 0.9, 10, 100),
        result('EMSR927_AOI03_GRA_MONIT01_v1', 0.5, 0.5, 90, 100),      # superseded by the product below
        result('EMSR927_AOI03_GRA_PRODUCT_v1', 0.2, 0.95, 30, 100),
        {'product': 'EMSR927_AOI05_GRA_PRODUCT_v3'},                     # outside the run: not compared
    ]
    summary = validate.summarise(results)
    assert summary == {'reference': 'Copernicus EMS EMSR927', 'areas': 2, 'recall': [0.04, 0.2],
                       'precision': [0.9, 0.95], 'building_recall': 0.2}
    assert validate.summarise(results[3:]) is None

    (tmp_path / 'satellite.json').write_text('{"event": "2026-08-26"}', encoding='utf-8')
    validate.attach(tmp_path, summary)
    import json
    assert json.loads((tmp_path / 'satellite.json').read_text(encoding='utf-8')) == {
        'event': '2026-08-26', 'validation': summary}


def test_compare_bridges():
    study = box(X, Y, X + 1000, Y + 100)
    ours = gpd.GeoDataFrame(
        {'status': ['destroyed', 'operational', 'destroyed']},
        geometry=[Point(X + 50, Y + 50), Point(X + 300, Y + 50), Point(X + 900, Y + 50)], crs=CRS)
    reference = gpd.GeoDataFrame(
        {'damage_gra': ['Destroyed', 'Destroyed', 'Destroyed', 'Possibly damaged']},
        geometry=[Point(X + 60, Y + 50), Point(X + 310, Y + 50), Point(X + 600, Y + 50), Point(X + 900, Y + 50)],
        crs=CRS)
    result = validate.compare_bridges(ours, reference, study)
    assert result == {'reference_destroyed_or_damaged': 3, 'of_which_in_our_osm': 2,
                      'of_which_we_flagged': 1, 'ours_flagged': 2}
