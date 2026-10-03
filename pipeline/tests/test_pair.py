import sys
from pathlib import Path
from types import SimpleNamespace

sys.path.insert(0, str(Path(__file__).parent.parent))

import fetch_s1  # noqa: E402


def item(day, orbit, state='ascending'):
    return SimpleNamespace(properties={
        'datetime': f'{day}T00:00:00Z', 'sat:relative_orbit': orbit,
        'sat:orbit_state': state, 'sar:instrument_mode': 'IW',
    })


def test_pair_requires_same_track_and_12_days():
    items = [item('2026-08-20', 85), item('2026-08-32'.replace('32', '01'), 85),
             item('2026-08-20', 12), item('2026-09-01', 12)]
    # 20 Aug (track 85) has no partner 12 days later on track 85;
    # tracks 12 pair 20 Aug -> 1 Sep.
    before, after = fetch_s1.choose_pair(items, '2026-08-26')
    assert before.properties['sat:relative_orbit'] == 12
    assert after.properties['datetime'].startswith('2026-09-01')


def test_pair_none_when_tracks_differ():
    items = [item('2026-08-20', 85), item('2026-09-01', 12)]
    assert fetch_s1.choose_pair(items, '2026-08-26') is None


def scene(day, orbit, west, east):
    s = item(day, orbit)
    s.geometry = {'type': 'Polygon', 'coordinates': [[[west, 27], [east, 27], [east, 29], [west, 29], [west, 27]]]}
    return s


def test_pair_prefers_the_earliest_image_after_the_event():
    items = [item('2026-08-24', 19), item('2026-09-05', 19),      # 10 days after
             item('2026-08-16', 85), item('2026-08-28', 85)]      # 2 days after
    before, after = fetch_s1.choose_pair(items, '2026-08-26')
    assert after.properties['datetime'].startswith('2026-08-28')
    assert before.properties['sat:relative_orbit'] == 85


def test_pair_covering_the_whole_area_beats_an_earlier_partial_one():
    bbox = '85.1,27.9,85.5,28.3'
    items = [scene('2026-08-19', 121, 85.23, 88.0), scene('2026-08-31', 121, 85.23, 88.0),   # misses the west
             scene('2026-08-24', 19, 83.2, 86.0), scene('2026-09-05', 19, 83.2, 86.0)]
    assert round(fetch_s1.coverage(items[0], bbox), 3) == 0.675
    before, after = fetch_s1.choose_pair(items, '2026-08-26', bbox=bbox)
    assert before.properties['sat:relative_orbit'] == 19
    # With nothing better, the partial pair is still returned.
    partial = fetch_s1.choose_pair(items[:2], '2026-08-26', bbox=bbox)
    assert partial[0].properties['sat:relative_orbit'] == 121
