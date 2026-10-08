import json
from datetime import date, timedelta
from pathlib import Path

import geopandas as gpd
import numpy as np
import pytest
import rasterio
from rasterio.transform import from_origin
from shapely.geometry import LineString, Point

import context

# A 2 x 2 population grid, 0.001 degrees a cell, upper left at 85.000 E, 28.002 N
TRANSFORM = from_origin(85.0, 28.002, 0.001, 0.001)
BBOX = (85.0, 28.0, 85.002, 28.002)


def write_grid(path, values, nodata=-99999.0):
    with rasterio.open(path, 'w', driver='GTiff', height=len(values), width=len(values[0]), count=1,
                       dtype='float32', crs='EPSG:4326', transform=TRANSFORM, nodata=nodata) as dst:
        dst.write(np.array(values, dtype='float32'), 1)
    return str(path)


def buildings(points, settlements):
    return gpd.GeoDataFrame({'settlement_id': settlements}, geometry=[Point(p) for p in points], crs='EPSG:4326')


def test_the_smallest_country_box_that_holds_the_area_is_tried_first():
    order = context.candidate_countries((85.1, 27.9, 85.5, 28.3))
    assert order[0] == 'NPL' and 'BTN' not in order
    assert context.candidate_countries((0.0, 0.0, 1.0, 1.0)) == []


def test_people_are_shared_over_the_buildings_in_each_cell_and_the_cell_total_is_kept(tmp_path):
    grid = write_grid(tmp_path / 'pop.tif', [[100, -99999], [40, 0]])
    cells, transform, url = context.read_population(BBOX, [grid])
    homes = buildings(
        [(85.0002, 28.0018), (85.0004, 28.0016), (85.0006, 28.0014),   # three in the 100-person cell
         (85.0003, 28.0007),                                           # one in the 40-person cell
         (85.0015, 28.0015),                                           # in the cell with no data
         (86.0, 29.0)],                                                # outside the grid
        ['A', 'A', 'B', 'B', 'A', 'A'])
    people = context.share_over_buildings(homes, cells, transform)
    assert people == {'A': pytest.approx(66.7, abs=0.1), 'B': pytest.approx(73.3, abs=0.1)}
    assert sum(people.values()) == pytest.approx(140.0, abs=0.2)


def test_the_first_file_with_data_is_used_and_missing_files_are_skipped(tmp_path):
    empty = write_grid(tmp_path / 'empty.tif', [[-99999, -99999], [-99999, -99999]])
    good = write_grid(tmp_path / 'good.tif', [[5, 5], [5, 5]])
    cells, _, url = context.read_population(BBOX, [str(tmp_path / 'missing.tif'), empty, good])
    assert url == good and float(np.nansum(cells)) == 20.0
    assert context.read_population(BBOX, [empty]) is None


def test_population_context_names_its_source_and_how_it_was_made(tmp_path):
    grid = write_grid(tmp_path / 'pop.tif', [[100, 100], [100, 100]])
    homes = buildings([(85.0005, 28.0015), (85.0015, 28.0015)], ['A', 'B'])
    result = context.population_context(BBOX, homes, files=[grid])
    assert result['by_settlement'] == {'A': 100.0, 'B': 100.0}
    assert result['people_in_mapped_buildings'] == 200
    assert result['file'] == 'pop.tif'
    assert 'WorldPop' in result['source'] and 'shared equally' in result['method']


class FakeResponse:
    def __init__(self, status=200, size=5, body=b'abcde'):
        self.status_code, self.headers, self.body = status, {'content-length': str(size)}, body

    def raise_for_status(self):
        pass

    def iter_content(self, n):
        yield self.body

    def __enter__(self):
        return self

    def __exit__(self, *args):
        return False


def test_a_country_file_is_downloaded_once_and_kept(tmp_path, monkeypatch):
    import requests
    calls = []
    monkeypatch.setattr(requests, 'head', lambda url, **kw: calls.append(('head', url)) or FakeResponse())
    monkeypatch.setattr(requests, 'get', lambda url, **kw: calls.append(('get', url)) or FakeResponse())
    first = context.download_worldpop('NPL', say=lambda *a: None, folder=tmp_path)
    assert Path(first).read_bytes() == b'abcde' and not list(tmp_path.glob('*.part'))
    assert 'npl_pop_2020_CN_100m_R2025A_v1.tif' in first
    again = context.download_worldpop('NPL', say=lambda *a: None, folder=tmp_path)
    assert again == first and len(calls) == 2         # the second call touched no network


def test_a_file_over_the_limit_or_missing_is_not_downloaded_and_says_why(tmp_path, monkeypatch):
    import requests
    said = []
    monkeypatch.setattr(requests, 'head', lambda url, **kw: FakeResponse(size=759_000_000))
    monkeypatch.setattr(requests, 'get', lambda *a, **kw: pytest.fail('must not download'))
    assert context.download_worldpop('IND', say=said.append, folder=tmp_path) is None
    assert 'over the 160 MB limit' in said[0]
    monkeypatch.setattr(requests, 'head', lambda url, **kw: FakeResponse(status=404))
    assert context.download_worldpop('XXX', say=said.append, folder=tmp_path) is None


def test_a_failed_download_leaves_nothing_that_looks_like_the_file(tmp_path, monkeypatch):
    import requests

    class Broken(FakeResponse):
        def iter_content(self, n):
            yield b'ab'
            raise requests.ConnectionError('dropped')

    monkeypatch.setattr(requests, 'head', lambda url, **kw: FakeResponse())
    monkeypatch.setattr(requests, 'get', lambda url, **kw: Broken())
    assert context.download_worldpop('NPL', say=lambda *a: None, folder=tmp_path) is None
    assert not list(tmp_path.glob('*.tif'))


def test_two_askers_for_one_file_download_it_once(tmp_path, monkeypatch):
    import threading
    import time

    import requests
    gets = []

    def slow_get(url, **kw):
        gets.append(url)
        time.sleep(0.2)                       # long enough for the second asker to arrive meanwhile
        return FakeResponse()

    monkeypatch.setattr(requests, 'head', lambda url, **kw: FakeResponse())
    monkeypatch.setattr(requests, 'get', slow_get)
    results = []
    threads = [threading.Thread(target=lambda: results.append(context.download_worldpop('NPL', say=lambda *a: None, folder=tmp_path)))
               for _ in range(2)]
    for t in threads:
        t.start()
    for t in threads:
        t.join()
    assert len(gets) == 1 and len(set(results)) == 1 and results[0] is not None


def test_prefetch_asks_for_the_countries_around_the_area_and_never_raises(monkeypatch):
    asked = []
    monkeypatch.setattr(context, 'download_worldpop', lambda iso, say=print: asked.append(iso) or None)
    context.prefetch((85.1, 27.9, 85.5, 28.3))
    assert asked == context.candidate_countries((85.1, 27.9, 85.5, 28.3)) and asked[0] == 'NPL'
    asked.clear()                                   # once a country has a file, the larger boxes are not tried
    monkeypatch.setattr(context, 'download_worldpop', lambda iso, say=print: asked.append(iso) or '/some/file.tif')
    context.prefetch((85.1, 27.9, 85.5, 28.3))
    assert asked == ['NPL']
    said = []
    monkeypatch.setattr(context, 'download_worldpop', lambda iso, say=print: 1 / 0)
    context.prefetch((85.1, 27.9, 85.5, 28.3), say=said.append)
    assert 'could not prepare' in said[0]


def test_no_buildings_or_no_data_is_no_population_not_an_error(tmp_path):
    grid = write_grid(tmp_path / 'pop.tif', [[1, 1], [1, 1]])
    assert context.population_context(BBOX, buildings([], []), files=[grid]) is None
    assert context.population_context(BBOX, buildings([(85.0005, 28.0015)], ['A']), files=[]) is None


def season(years=range(2000, 2026), base=10.0):
    series = {}
    for year in years:
        day = date(year, 8, 1)
        while day <= date(year, 9, 30):
            series[day.isoformat()] = base
            day += timedelta(days=1)
    return series


def test_the_flow_on_the_event_is_compared_with_the_same_time_of_year_in_earlier_years():
    series = season()
    series.update({'2026-08-26': 30.0, '2026-08-27': 35.0, '2026-08-25': 10.0})
    result = context.river_ratio(series, date(2026, 8, 26))
    assert result['normal_m3s'] == 10.0
    assert result['ratio_on_event'] == 3.0
    assert result['peak_m3s'] == 35.0 and result['ratio_peak'] == 3.5
    assert result['years'] == 26


def test_too_little_history_or_no_value_for_the_day_claims_nothing():
    assert context.river_ratio(season(years=range(2024, 2026)) | {'2026-08-26': 9.0}, date(2026, 8, 26)) is None
    assert context.river_ratio(season(), date(2026, 8, 26)) is None            # nothing recorded for 2026
    assert context.river_ratio({'2026-08-26': 0.0, **season(base=0.0)}, date(2026, 8, 26)) is None   # a dry river has no ratio


def test_the_river_point_is_on_the_longest_mapped_river():
    rivers = gpd.GeoDataFrame(
        {'waterway': ['river', 'river', 'stream']},
        geometry=[LineString([(85.0, 28.0), (85.2, 28.0)]), LineString([(85.0, 28.1), (85.02, 28.1)]),
                  LineString([(85.0, 28.2), (85.4, 28.2)])], crs='EPSG:4326')
    lon, lat = context.pick_river_point(rivers, (84.9, 27.9, 85.5, 28.3))
    assert lat == pytest.approx(28.0, abs=0.001) and lon == pytest.approx(85.1, abs=0.01)
    assert context.pick_river_point(None, (84.0, 27.0, 86.0, 29.0)) == (85.0, 28.0)


def test_river_context_carries_its_limits_and_is_none_when_the_service_is_down():
    series = season() | {'2026-08-26': 20.0}
    found = context.river_context(None, (85.0, 28.0, 85.2, 28.2), '2026-08-26', fetch=lambda lon, lat, end: series)
    assert found['ratio_on_event'] == 2.0
    assert 'cannot see a glacier collapse' in found['limits']
    assert context.river_context(None, (85.0, 28.0, 85.2, 28.2), '2026-08-26', fetch=lambda *a: None) is None


def test_build_fails_soft_and_write_removes_a_stale_file(tmp_path, monkeypatch):
    def broken(*args, **kwargs):
        raise OSError('offline')
    monkeypatch.setattr(context, 'population_context', broken)
    monkeypatch.setattr(context, 'river_context', broken)
    notes = []
    assert context.build(BBOX, '2026-08-26', buildings([], []), None, say=notes.append) is None
    assert len(notes) == 2

    (tmp_path / 'context.json').write_text('{}', encoding='utf-8')
    assert context.write(tmp_path, None) is None
    assert not (tmp_path / 'context.json').exists()
    made = context.write(tmp_path, {'population': None, 'river': {'ratio_on_event': 1.0}, 'attribution': []})
    assert json.loads(made.read_text(encoding='utf-8'))['river']['ratio_on_event'] == 1.0
