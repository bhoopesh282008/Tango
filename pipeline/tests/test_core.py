import sys
from pathlib import Path

import geopandas as gpd
import numpy as np
from rasterio.transform import from_origin
from shapely.geometry import LineString, Point, box

sys.path.insert(0, str(Path(__file__).parent.parent))

import cutoff  # noqa: E402
import damage  # noqa: E402
import segment  # noqa: E402
import config as C  # noqa: E402


def test_classify_known_flood():
    pre = np.full((10, 10), -10.0)
    post = pre.copy()
    post[:, :3] = -25.0   # water: dark and a big drop
    post[:, 7:] = -5.0    # debris: +5 dB
    classes, conf = segment.classify(pre, post)
    assert (classes[:, :3] == C.CLASS_WATER).all()
    assert (classes[:, 7:] == C.CLASS_DEBRIS).all()
    assert (classes[:, 3:7] == 0).all()
    assert conf[classes == 0].max() == 0


def test_classify_masks_steep_slope_and_nan():
    pre = np.full((4, 4), -10.0)
    post = np.full((4, 4), -25.0)
    post[0, 0] = np.nan
    slope = np.zeros((4, 4))
    slope[1, :] = 45
    classes, _ = segment.classify(pre, post, slope)
    assert classes[0, 0] == 0
    assert (classes[1, :] == 0).all()
    assert classes[2, 2] == C.CLASS_WATER


def test_vectorise_area():
    # 100 m pixels around lon/lat is awkward; use a UTM-like metric CRS.
    classes = np.zeros((20, 20), dtype=np.uint8)
    classes[5:15, 5:15] = C.CLASS_WATER
    conf = np.where(classes > 0, 0.9, 0).astype('float32')
    transform = from_origin(500000, 3100000, 100, 100)
    gdf = segment.vectorise(classes, conf, transform, 'EPSG:32645')
    assert len(gdf) == 1
    assert gdf.loc[0, 'type'] == 'water'
    assert abs(gdf.loc[0, 'area_km2'] - 1.0) < 0.01   # 100 x 100 m cells x 100 = 1 km2
    assert gdf.loc[0, 'confidence'] == 0.9


def _network():
    # Valley road A(0) - B(1000) - C(2000) - D(3000) in UTM metres; hospital at D.
    crs = 'EPSG:32645'
    base = (500000, 3000000)
    pts = [(base[0] + i * 1000, base[1]) for i in range(4)]
    roads = gpd.GeoDataFrame(
        {'damaged': [False, True, False]},
        geometry=[LineString([pts[i], pts[i + 1]]) for i in range(3)],
        crs=crs,
    )
    settlements = gpd.GeoDataFrame(
        {'id': ['A', 'B', 'C', 'D']}, geometry=[Point(p) for p in pts], crs=crs
    )
    hospital = gpd.GeoDataFrame({'id': ['h']}, geometry=[Point(pts[3])], crs=crs)
    return roads, settlements, hospital


def test_cutoff_marks_settlements_behind_damaged_road():
    roads, settlements, hospital = _network()
    result = cutoff.connectivity(settlements, hospital, roads)
    assert result == {'A': False, 'B': False, 'C': True, 'D': True}


def test_cutoff_reports_unknown_when_never_connected():
    roads, settlements, hospital = _network()
    far = gpd.GeoDataFrame({'id': ['X']}, geometry=[Point(510000, 3010000)], crs=settlements.crs)
    result = cutoff.connectivity(far, hospital, roads)
    assert result == {'X': None}


def test_flag_damaged_and_assign_settlement():
    crs = 'EPSG:32645'
    zones = gpd.GeoDataFrame(
        {'type': ['water', 'uncertain']},
        geometry=[box(0, 0, 100, 100), box(500, 500, 600, 600)],
        crs=crs,
    )
    buildings = gpd.GeoDataFrame(
        geometry=[box(10, 10, 20, 20), box(510, 510, 520, 520), box(900, 900, 910, 910)],
        crs=crs,
    )
    flagged = damage.flag_damaged(buildings, zones)
    # uncertain zones do not count as confirmed damage
    assert flagged['damaged'].tolist() == [True, False, False]

    settlements = gpd.GeoDataFrame(
        {'id': ['s1', 's2']}, geometry=[Point(0, 0), Point(1000, 1000)], crs=crs
    )
    assigned = damage.assign_settlement(buildings, settlements)
    assert assigned['settlement_id'].tolist() == ['s1', 's2', 's2']


def test_flooded_length_counts_only_the_part_inside_a_zone():
    # A 1 km road crosses a 100 m wide water zone; another crosses only an uncertain zone.
    crs = 'EPSG:32645'
    x, y = 331000, 3110000
    zones = gpd.GeoDataFrame({'type': ['water', 'uncertain']},
                             geometry=[box(x + 400, y - 50, x + 500, y + 50), box(x, y + 900, x + 1000, y + 1100)],
                             crs=crs)
    roads = gpd.GeoDataFrame(geometry=[LineString([(x, y), (x + 1000, y)]),
                                       LineString([(x, y + 1000), (x + 1000, y + 1000)])], crs=crs)
    assert damage.flooded_length_km(roads, zones) == [0.1, 0.0]
    # Roads in degrees, as OSM delivers them, give the same answer.
    assert damage.flooded_length_km(roads.to_crs('EPSG:4326'), zones) == [0.1, 0.0]
    assert damage.flooded_length_km(roads, zones[zones['type'] == 'uncertain']) == [0.0, 0.0]


def test_flag_damaged_compares_layers_in_different_coordinate_systems():
    # Zones on a UTM grid, features in degrees, as in a real run.
    zones = gpd.GeoDataFrame({'type': ['water']}, geometry=[box(331000, 3110000, 332000, 3111000)], crs='EPSG:32645')
    inside = zones.to_crs('EPSG:4326').geometry[0].centroid
    features = gpd.GeoDataFrame(geometry=[inside.buffer(0.0002), inside.buffer(0.0002).__class__(
        [(x + 0.2, y) for x, y in inside.buffer(0.0002).exterior.coords])], crs='EPSG:4326')
    assert damage.flag_damaged(features, zones)['damaged'].tolist() == [True, False]
