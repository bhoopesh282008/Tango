from types import SimpleNamespace

import numpy as np
import pytest

import fetch_s1
import run

BBOX = '79.55,30.35,79.85,30.65'


def frame(name, day, west, east, orbit=129):
    """A catalogue item: one frame of a pass, as a strip of longitudes from west to east."""
    return SimpleNamespace(
        id=name,
        properties={'datetime': f'{day}T00:00:00Z', 'sat:relative_orbit': orbit,
                    'sat:orbit_state': 'ascending', 'sar:instrument_mode': 'IW'},
        geometry={'type': 'Polygon', 'coordinates': [[[west, 30.0], [east, 30.0], [east, 31.0], [west, 31.0], [west, 30.0]]]},
    )


def chamoli(day):
    """The area as the catalogue reports it for 2021: a large frame and a 16% sliver beside it."""
    return [frame(f'{day}-big', day, 79.55 + 0.048, 80.2), frame(f'{day}-sliver', day, 79.0, 79.55 + 0.048)]


def test_frames_of_one_track_and_day_make_one_pass_that_covers_what_they_cover_together():
    items = chamoli('2021-02-03') + chamoli('2021-02-15')
    passes = fetch_s1.group_passes(items)
    assert len(passes) == 2
    assert [len(p.items) for p in passes] == [2, 2]
    assert passes[0].id == '2021-02-03-sliver+2021-02-03-big' or passes[0].id == '2021-02-03-big+2021-02-03-sliver'
    assert round(fetch_s1.coverage(items[0], BBOX), 2) == 0.84          # the big frame alone: the Chamoli case
    assert fetch_s1.coverage(passes[0], BBOX) == pytest.approx(1.0)


def test_other_tracks_and_days_stay_separate_and_a_single_frame_keeps_its_own_id():
    items = [frame('a', '2021-02-03', 79, 81), frame('b', '2021-02-03', 79, 81, orbit=56), frame('c', '2021-02-15', 79, 81)]
    passes = fetch_s1.group_passes(items)
    assert sorted(p.id for p in passes) == ['a', 'b', 'c']                 # the id a saved run recorded still matches


def test_a_pair_of_whole_passes_beats_one_big_frame_that_covers_84_percent():
    # an earlier pair on another track whose single frame covers 84% of the area
    other = [frame('x', '2021-01-30', 79.598, 80.2, orbit=56), frame('y', '2021-02-11', 79.598, 80.2, orbit=56)]
    items = fetch_s1.group_passes(chamoli('2021-02-03') + chamoli('2021-02-15') + other)
    before, after = fetch_s1.choose_pair(items, '2021-02-07', bbox=BBOX)
    assert before.properties['sat:relative_orbit'] == 129 and len(before.items) == 2 and len(after.items) == 2


def test_earlier_scenes_for_the_baseline_are_found_when_only_the_frames_together_cover_the_area():
    items = fetch_s1.group_passes(chamoli('2021-01-22') + chamoli('2021-01-10'))
    chosen = fetch_s1.choose_history(items, 129, 'ascending', '2021-02-03', 2, bbox=BBOX)
    assert [fetch_s1._day(p).isoformat() for p in chosen] == ['2021-01-22', '2021-01-10']
    # one frame on its own would not do (this is why the baseline was silently skipped)
    singles = chamoli('2021-01-22')[:1] + chamoli('2021-01-10')[:1]
    assert fetch_s1.choose_history(singles, 129, 'ascending', '2021-02-03', 2, bbox=BBOX) == []


def fake_pipeline(monkeypatch, frames):
    """Stand in for reading and correcting scenes: each frame yields a grid filled where it has data."""
    def get_scene(item, pol):
        return SimpleNamespace(product_xml=item.id, calibration_xml=None, noise_xml=None)

    def geocode(ann, crs, xs, ys, height):
        shape = (4, 8)
        return {'line': np.zeros(shape), 'pixel': np.zeros(shape), 'layover': np.zeros(shape, bool),
                'shadow': np.zeros(shape, bool), 'slope_deg': np.zeros(shape)}

    def radar_window(geo, ann):
        if ann.name in frames['outside']:
            raise ValueError('The scene does not cover the requested area')
        return 0, 4, 0, 8

    def terrain_correct(dn, window, geo, cal, noise):
        return frames['data'][geo['name']]

    monkeypatch.setattr(run.download, 'get_scene', get_scene)
    monkeypatch.setattr(run.download, 'read_window', lambda scene, window: scene)
    monkeypatch.setattr(run.P, 'parse_annotation', lambda xml: SimpleNamespace(name=xml, n_lines=100, n_samples=100))
    monkeypatch.setattr(run.P, 'geocode', lambda ann, *a: {**geocode(ann, *a), 'name': ann.name})
    monkeypatch.setattr(run.P, 'radar_window', radar_window)
    monkeypatch.setattr(run.P, 'parse_calibration', lambda xml: None)
    monkeypatch.setattr(run.P, 'parse_noise', lambda xml: None)
    monkeypatch.setattr(run.P, 'terrain_correct', terrain_correct)


def test_every_frame_of_a_pass_is_read_and_joined_where_the_first_wins_an_overlap(monkeypatch):
    left = np.full((4, 8), np.nan, 'float32')
    left[:, :5] = -10.0
    right = np.full((4, 8), np.nan, 'float32')
    right[:, 4:] = -20.0
    fake_pipeline(monkeypatch, {'data': {'left': left, 'right': right}, 'outside': set()})
    said = []
    one_pass = fetch_s1.Pass([frame('left', '2021-02-03', 79, 80), frame('right', '2021-02-03', 80, 81)])
    db, geo, ann, masked = run.read_pass(one_pass, 'vv', 'EPSG:32644', None, None, None, None, lambda *a, **k: said.append(a[0]))
    assert (db[:, :5] == -10.0).all() and (db[:, 5:] == -20.0).all()      # column 4 overlaps: the first frame's value
    assert ann.name == 'left' and masked == 0.0
    assert any('Frame 2 of 2' in line for line in said)


def test_a_frame_that_only_touches_the_edge_is_skipped_not_fatal(monkeypatch):
    whole = np.full((4, 8), -12.0, 'float32')
    fake_pipeline(monkeypatch, {'data': {'main': whole, 'edge': whole}, 'outside': {'edge'}})
    one_pass = fetch_s1.Pass([frame('main', '2021-02-03', 79, 80), frame('edge', '2021-02-03', 80, 81)])
    db = run.read_pass(one_pass, 'vv', 'EPSG:32644', None, None, None)[0]
    assert (db == -12.0).all()
    # but if the only frame does not cover the area, that is an error the person must see
    lone = fetch_s1.Pass([frame('edge', '2021-02-03', 80, 81)])
    with pytest.raises(ValueError, match='does not cover'):
        run.read_pass(lone, 'vv', 'EPSG:32644', None, None, None)
