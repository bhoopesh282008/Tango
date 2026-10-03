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
