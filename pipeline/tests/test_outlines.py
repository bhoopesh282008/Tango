import json
import re
import sys
from pathlib import Path

import geopandas as gpd
import numpy as np
import pytest
import rasterio
from rasterio.transform import from_origin
from shapely.geometry import Polygon, box

sys.path.insert(0, str(Path(__file__).parent.parent))

import add_outlines  # noqa: E402
import quicklook  # noqa: E402

CRS = 'EPSG:32645'
CELL = 10.0
# The grid's top-left corner; a cell (row, col) spans x = X0 + col * 10 and y = Y0 - row * 10.
X0, Y0 = 500000.0, 3100000.0
TRANSFORM = from_origin(X0, Y0, CELL, CELL)


def cells(row0, col0, row1, col1):
    """A rectangle covering grid cells [row0, row1) x [col0, col1)."""
    return box(X0 + col0 * CELL, Y0 - row1 * CELL, X0 + col1 * CELL, Y0 - row0 * CELL)


def zones(*items):
    return gpd.GeoDataFrame({'type': [k for k, _ in items]}, geometry=[g for _, g in items], crs=CRS)


def numbers(path):
    return [float(n) for n in re.findall(r'-?\d+\.\d', path)]


def test_a_zone_lands_on_its_own_pixels_in_the_shrunk_and_the_close_up_pictures():
    # 3000 x 2000 cells shrink 2 times to 1500 x 1000 (the longer side may not pass 1600)
    shape = (3000, 2000)
    out = quicklook.zone_outlines(zones(('water', cells(100, 40, 120, 80))), TRANSFORM, shape, detail_window=(90, 30, 100, 100))
    whole, detail = out['whole'], out['detail']
    assert (whole['width'], whole['height']) == (1000, 1500)
    xs, ys = numbers(whole['paths']['water'])[0::2], numbers(whole['paths']['water'])[1::2]
    assert (min(xs), max(xs), min(ys), max(ys)) == (20.0, 40.0, 50.0, 60.0)       # grid cells / 2
    assert (detail['width'], detail['height']) == (100, 100)
    xs, ys = numbers(detail['paths']['water'])[0::2], numbers(detail['paths']['water'])[1::2]
    assert (min(xs), max(xs), min(ys), max(ys)) == (10.0, 50.0, 10.0, 30.0)       # grid cells less the window's corner


def test_the_close_up_keeps_only_the_zones_that_reach_it_and_keeps_the_types_apart():
    items = [('water', cells(10, 10, 20, 20)), ('debris', cells(30, 30, 40, 40)), ('water', cells(500, 500, 510, 510)),
             ('uncertain', cells(5, 90, 15, 130))]               # this one runs across the picture's edge
    out = quicklook.zone_outlines(zones(*items), TRANSFORM, (800, 800), detail_window=(0, 0, 100, 100))
    assert sorted(out['detail']['paths']) == ['debris', 'uncertain', 'water']
    assert out['detail']['paths']['water'].count('M') == 1       # the far zone is not in the close-up
    assert out['whole']['paths']['water'].count('M') == 2        # but it is in the whole picture
    assert max(numbers(out['detail']['paths']['uncertain'])[0::2]) == 130.0   # not clipped to the edge: no false border


def test_a_hole_is_a_second_ring_and_points_along_a_straight_edge_are_dropped():
    ring = cells(10, 10, 60, 60)
    with_hole = Polygon(ring.exterior.coords, [cells(20, 20, 30, 30).exterior.coords])
    out = quicklook.zone_outlines(zones(('water', with_hole)), TRANSFORM, (100, 100))
    assert out['whole']['paths']['water'].count('M') == 2 and out['detail'] is None
    # A raster polygon has a vertex at every cell corner, also along a straight edge; those add nothing.
    edge = [(i, 0) for i in range(20)] + [(20, i) for i in range(20)] + [(20 - i, 20) for i in range(20)] + [(0, 20 - i) for i in range(20)]
    square = gpd.GeoDataFrame({'type': ['water']}, geometry=[
        Polygon([(X0 + x * CELL, Y0 - y * CELL) for x, y in edge])], crs=CRS)
    assert len(square.geometry[0].exterior.coords) == 81
    assert quicklook.zone_outlines(square, TRANSFORM, (100, 100))['whole']['paths']['water'] == 'M0.0 0.0L20.0 0.0L20.0 20.0L0.0 20.0Z'
    # a step of half a cell or less is raster jitter and goes; a real two-cell step stays
    def stepped(height):
        return gpd.GeoDataFrame({'type': ['water']}, geometry=[Polygon(
            [(X0 + x * CELL, Y0 - y * CELL) for x, y in [(0, 0), (10, 0), (10, height), (20, height), (20, 10), (0, 10)]])], crs=CRS)
    assert quicklook.zone_outlines(stepped(1), TRANSFORM, (100, 100))['whole']['paths']['water'].count('L') == 3
    assert quicklook.zone_outlines(stepped(2), TRANSFORM, (100, 100))['whole']['paths']['water'].count('L') == 5


def test_no_zones_means_no_file_and_a_rerun_removes_the_last_runs():
    empty = quicklook.zone_outlines(zones(), TRANSFORM, (100, 100), detail_window=(0, 0, 50, 50))
    assert empty['whole']['paths'] == {} and empty['detail']['paths'] == {}
    folder = Path(__file__).parent / '_outlines_tmp'
    folder.mkdir(exist_ok=True)
    try:
        (folder / 'outlines.json').write_text('{}')
        assert quicklook.write_outlines(folder, empty) is False
        assert not (folder / 'outlines.json').exists()
    finally:
        for leftover in folder.glob('*'):
            leftover.unlink()
        folder.rmdir()


def make_run(folder, side=100):
    """A small finished run: rasters, pictures, close-up and zones, as run.py leaves them."""
    rng = np.random.default_rng(7)
    pre = rng.uniform(-22, -2, (400, 300)).astype('float32')
    post = pre.copy()
    post[210:290, 150:240] -= 9                                  # the flooded patch
    (folder / 'rasters').mkdir(parents=True)
    with rasterio.open(folder / 'rasters' / 'pre_vv_db.tif', 'w', driver='GTiff', height=400, width=300, count=1,
                       dtype='float32', crs=CRS, transform=TRANSFORM) as dst:
        dst.write(pre, 1)
    flood = np.zeros(pre.shape, bool)
    flood[210:290, 150:240] = True
    quicklook.radar_png(pre, folder / 'before.png')
    window = quicklook.detail_pngs(pre, post, flood, folder, side=side)
    found = gpd.GeoDataFrame({'type': ['water']}, geometry=[cells(210, 150, 290, 240)], crs=CRS)
    found.to_crs(4326).to_file(folder / 'flood_zones.geojson', driver='GeoJSON')
    return window


def test_an_older_run_gets_its_outlines_by_finding_where_its_close_up_is(tmp_path):
    window = make_run(tmp_path)
    out = add_outlines.add_outlines(tmp_path)
    saved = json.loads((tmp_path / 'outlines.json').read_text())
    assert saved == out
    row, col, rows, cols = window
    xs, ys = numbers(saved['detail']['paths']['water'])[0::2], numbers(saved['detail']['paths']['water'])[1::2]
    assert (min(xs), max(xs), min(ys), max(ys)) == pytest.approx((150 - col, 240 - col, 210 - row, 290 - row), abs=0.2)
    assert (saved['detail']['width'], saved['detail']['height']) == (cols, rows)


def test_a_close_up_that_is_not_from_these_rasters_is_refused_and_nothing_is_written(tmp_path):
    make_run(tmp_path)
    other = np.random.default_rng(99).uniform(-22, -2, (100, 100)).astype('float32')
    quicklook.radar_png(other, tmp_path / 'before_detail.png', max_side=None)
    with pytest.raises(SystemExit, match='Could not place the close-up'):
        add_outlines.add_outlines(tmp_path)
    assert not (tmp_path / 'outlines.json').exists()


def test_pictures_of_another_size_are_refused(tmp_path):
    make_run(tmp_path)
    quicklook.radar_png(np.zeros((50, 50), 'float32'), tmp_path / 'before.png')
    with pytest.raises(SystemExit, match='not from these rasters'):
        add_outlines.add_outlines(tmp_path)
