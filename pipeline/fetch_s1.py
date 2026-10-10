"""Find a same-orbit Sentinel-1 before/after pair on the Copernicus Data Space.

Searching needs no account; reading the scenes does (see download.py).
"""
import time
from datetime import date, datetime, timedelta

from pystac_client import Client
from pystac_client.exceptions import APIError
from shapely.geometry import box, mapping, shape
from shapely.ops import unary_union

STAC_URL = 'https://stac.dataspace.copernicus.eu/v1'
REVISIT_DAYS = 12
# A scene that covers this share of the area counts as covering all of it. Beyond that point
# more coverage no longer matters: an image two days after the flood beats one ten days after
# it that happens to cover 100% instead of 99%. (Frames are cut along the orbit, so a scene
# often misses a sliver of the area's edge.)
FULL_COVERAGE = 0.97
SEARCH_ATTEMPTS = 3


def search(bbox, start, end, attempts=SEARCH_ATTEMPTS, pause=2.0):
    """Sentinel-1 GRD items over bbox (W,S,E,N) between ISO dates.

    The catalogue is a public web service that now and then fails for a moment, so a failed
    request is repeated, with a longer wait each time, before giving up.
    """
    for attempt in range(1, attempts + 1):
        try:
            result = Client.open(STAC_URL).search(
                collections=['sentinel-1-grd'],
                bbox=[float(v) for v in bbox.split(',')],
                datetime=f'{start}/{end}',
                max_items=200,
            )
            return list(result.items())
        except (OSError, APIError) as error:   # requests' errors are OSErrors
            if attempt == attempts:
                raise RuntimeError(
                    f'The Copernicus catalogue could not be searched after {attempts} tries ({error}). '
                    f'Check the internet connection and try again; the service may be down.'
                ) from error
            time.sleep(pause * attempt)


def _day(item):
    return datetime.fromisoformat(item.properties['datetime'].replace('Z', '+00:00')).date()


def _track(item):
    p = item.properties
    return (p.get('sat:relative_orbit'), p.get('sat:orbit_state'), p.get('sar:instrument_mode'))


class Pass:
    """One pass of the satellite over the area: every frame of it on the track that touches the area.

    Sentinel-1 scenes are cut into frames along the orbit, so an area near a cut lies in two of them
    (84% and 16% for the 2021 Chamoli flood). Taken one by one neither covers the area; together they do.
    A Pass looks like a catalogue item (properties, id, geometry) so the choice of pair, which only
    reads those, does not care; `items` are the frames to read.
    """

    def __init__(self, items):
        self.items = sorted(items, key=lambda i: i.properties['datetime'])
        self.properties = self.items[0].properties
        self.id = '+'.join(getattr(i, 'id', '') for i in self.items)
        shapes = [shape(i.geometry) for i in self.items if getattr(i, 'geometry', None)]
        self.geometry = mapping(unary_union(shapes)) if shapes else None


def group_passes(items):
    """Catalogue items -> Passes: the frames of one track on one day go together."""
    groups = {}
    for item in items:
        groups.setdefault((_track(item), _day(item)), []).append(item)
    return [Pass(group) for group in groups.values()]


def coverage(item, bbox):
    """Share of the bbox (W,S,E,N string) inside the scene footprint, 0 to 1."""
    geometry = getattr(item, 'geometry', None)
    if not bbox or not geometry:
        return 1.0
    area = box(*(float(v) for v in bbox.split(',')))
    return shape(geometry).intersection(area).area / area.area


def choose_pair(items, event_day, tolerance_days=3, bbox=None):
    """Pick (before, after) on the same track, REVISIT_DAYS apart, bracketing the event.

    Different tracks view the terrain from different angles and cannot be
    compared pixel by pixel, so a pair is only accepted within one track.
    Among valid pairs, those whose scenes cover the area (FULL_COVERAGE) come first, and of
    those the one with the earliest image after the event: for rescue, days matter more than a
    slightly closer "before" scene, or a sliver more coverage. If no pair covers the area,
    the one covering most of it wins. Returns None if no pair exists.
    """
    event_day = event_day if isinstance(event_day, date) else date.fromisoformat(event_day)
    best = None
    for before in items:
        for after in items:
            if _track(before) != _track(after) or _track(before)[0] is None:
                continue
            gap = (_day(after) - _day(before)).days
            if abs(gap - REVISIT_DAYS) > tolerance_days:
                continue
            if not (_day(before) < event_day <= _day(after)):
                continue
            covered = min(coverage(before, bbox), coverage(after, bbox))
            full = covered >= FULL_COVERAGE
            score = (
                0 if full else 1,                     # a pair that covers the area first
                0 if full else -round(covered, 2),    # short of that, the most coverage
                (_day(after) - event_day).days,       # earliest look at the flood
                (event_day - _day(before)).days,
                abs(gap - REVISIT_DAYS),
            )
            if best is None or score < best[0]:
                best = (score, before, after)
    return None if best is None else (best[1], best[2])


def choose_history(items, orbit, state, pre_day, count=2, tolerance_days=3, bbox=None):
    """Earlier scenes on the same track, about 12, 24, ... days before `pre_day`, nearest first.

    Returns a list of 0..count items, the k-th as close as it can be to pre_day - 12k days (within
    `tolerance_days`) among scenes that cover the area. A track is its orbit number and direction.
    The series stops at a gap: a scene after a gap would not be 12 k days apart.
    """
    pre_day = pre_day if isinstance(pre_day, date) else date.fromisoformat(pre_day)
    same = [i for i in items
            if i.properties.get('sat:relative_orbit') == orbit and i.properties.get('sat:orbit_state') == state
            and _day(i) < pre_day and coverage(i, bbox) >= FULL_COVERAGE]
    chosen = []
    for k in range(1, count + 1):
        target = pre_day - timedelta(days=REVISIT_DAYS * k)
        near = [i for i in same if abs((_day(i) - target).days) <= tolerance_days and i not in chosen]
        if not near:
            break
        chosen.append(min(near, key=lambda i: abs((_day(i) - target).days)))
    return chosen


def find_history(bbox, orbit, state, pre_day, count=2):
    """Search for the scenes before `pre_day` that choose_history picks. May return fewer than `count`."""
    pre_day = pre_day if isinstance(pre_day, date) else date.fromisoformat(pre_day)
    items = group_passes(search(bbox, (pre_day - timedelta(days=REVISIT_DAYS * count + 6)).isoformat(),
                                (pre_day - timedelta(days=1)).isoformat()))
    return choose_history(items, orbit, state, pre_day, count, bbox=bbox), items


def describe_scenes(items):
    """'track 19 descending: 2026-08-12, 2026-08-24; track 85 ascending: ...' for an error message."""
    by_track = {}
    for item in items:
        track = _track(item)
        by_track.setdefault(f'track {track[0]} {track[1]}', set()).add(_day(item).isoformat())
    return '; '.join(f"{name}: {', '.join(sorted(days))}" for name, days in sorted(by_track.items()))


def find_pair(bbox, event_day, search_days=20):
    """Search around the event and return the best same-track (before, after) pair."""
    event = date.fromisoformat(event_day) if isinstance(event_day, str) else event_day
    window = timedelta(days=search_days)
    items = group_passes(search(bbox, (event - window).isoformat(), (event + window).isoformat()))
    pair = choose_pair(items, event, bbox=bbox)
    if pair is None:
        if not items:
            raise RuntimeError(
                f'No Sentinel-1 scenes cover {bbox} within {search_days} days of {event}. '
                f'Check that the area is W,S,E,N in degrees and the date is right.'
            )
        raise RuntimeError(
            f'No Sentinel-1 pair brackets {event} over {bbox}. A pair needs two scenes on the same orbit '
            f'track about {REVISIT_DAYS} days apart, one before the event and one on or after it. '
            f'Found {len(items)} scenes within {search_days} days: {describe_scenes(items)}. '
            f'A longer search may find one (--search-days {search_days * 2}); if the event is very recent, '
            f'the "after" scene may not have been acquired yet.'
        )
    return pair
