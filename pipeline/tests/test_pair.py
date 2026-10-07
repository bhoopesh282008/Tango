import sys
from pathlib import Path
from types import SimpleNamespace

import pytest

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


# The second Trishuli area, as the Copernicus catalogue really reports it: track 19 covers all of
# it, track 85 (one frame) covers 99.2%. Track 85 sees the flood two days after it, track 19 ten
# days after. The old rule compared coverage rounded to two decimals even among "full" scenes,
# so 1.00 beat 0.99 and the later image won.
SECOND_AREA = '84.9,27.75,85.25,28.02'


def test_a_sliver_less_coverage_does_not_cost_the_earliest_image():
    west = 84.9 + 0.35 * (1 - 0.9922)
    items = [scene('2026-08-24', 19, 83.0, 86.0), scene('2026-09-05', 19, 83.0, 86.0),
             scene('2026-08-16', 85, west, 86.0), scene('2026-08-28', 85, west, 86.0)]
    assert round(fetch_s1.coverage(items[2], SECOND_AREA), 4) == 0.9922
    before, after = fetch_s1.choose_pair(items, '2026-08-26', bbox=SECOND_AREA)
    assert before.properties['sat:relative_orbit'] == 85
    assert after.properties['datetime'].startswith('2026-08-28')


def test_a_neighbouring_frame_with_a_sliver_of_the_area_is_not_a_candidate():
    # The catalogue also lists the next frame along the track, covering 0.8% of the area
    west = 84.9 + 0.35 * (1 - 0.9922)
    items = [scene('2026-08-16', 85, west, 86.0), scene('2026-08-16', 85, 83.0, 84.9027),
             scene('2026-08-28', 85, west, 86.0), scene('2026-08-28', 85, 83.0, 84.9027)]
    before, after = fetch_s1.choose_pair(items, '2026-08-26', bbox=SECOND_AREA)
    assert fetch_s1.coverage(before, SECOND_AREA) > 0.99 and fetch_s1.coverage(after, SECOND_AREA) > 0.99


def test_short_of_full_coverage_the_pair_covering_most_still_wins_over_an_earlier_one():
    west_90 = 84.9 + 0.35 * 0.10      # covers 90%
    west_80 = 84.9 + 0.35 * 0.20      # covers 80%
    items = [scene('2026-08-24', 19, west_90, 86.0), scene('2026-09-05', 19, west_90, 86.0),
             scene('2026-08-16', 85, west_80, 86.0), scene('2026-08-28', 85, west_80, 86.0)]
    before, _ = fetch_s1.choose_pair(items, '2026-08-26', bbox=SECOND_AREA)
    assert before.properties['sat:relative_orbit'] == 19


def test_no_scenes_at_all_says_to_check_the_area_and_the_date(monkeypatch):
    monkeypatch.setattr(fetch_s1, 'search', lambda *a, **k: [])
    with pytest.raises(RuntimeError, match='No Sentinel-1 scenes cover .* Check that the area is W,S,E,N'):
        fetch_s1.find_pair(SECOND_AREA, '2026-08-26')


def test_no_pair_lists_what_was_found_and_suggests_a_longer_search(monkeypatch):
    monkeypatch.setattr(fetch_s1, 'search', lambda *a, **k: [item('2026-08-16', 85), item('2026-08-20', 19)])
    with pytest.raises(RuntimeError) as error:
        fetch_s1.find_pair(SECOND_AREA, '2026-08-26')
    message = str(error.value)
    assert 'track 85 ascending: 2026-08-16' in message
    assert 'track 19 ascending: 2026-08-20' in message
    assert '--search-days 40' in message


class FlakyClient:
    """A catalogue client whose search fails the first `failures` times."""

    def __init__(self, failures):
        self.failures, self.calls = failures, 0

    def search(self, **kwargs):
        self.calls += 1
        if self.calls <= self.failures:
            raise ConnectionError('connection reset')
        return SimpleNamespace(items=lambda: iter(['scene']))


def test_a_failed_catalogue_request_is_repeated(monkeypatch):
    client = FlakyClient(failures=2)
    monkeypatch.setattr(fetch_s1.Client, 'open', staticmethod(lambda url: client))
    assert fetch_s1.search(SECOND_AREA, '2026-08-06', '2026-09-15', pause=0) == ['scene']
    assert client.calls == 3


def test_a_catalogue_that_stays_down_gives_a_message_not_a_stack_trace(monkeypatch):
    client = FlakyClient(failures=99)
    monkeypatch.setattr(fetch_s1.Client, 'open', staticmethod(lambda url: client))
    with pytest.raises(RuntimeError, match='could not be searched after 3 tries'):
        fetch_s1.search(SECOND_AREA, '2026-08-06', '2026-09-15', pause=0)
    assert client.calls == 3
