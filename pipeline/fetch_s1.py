"""Find a same-orbit Sentinel-1 before/after pair on the Copernicus Data Space.

Searching needs no account; reading the scenes does (see download.py).
"""
import time
from datetime import date, datetime, timedelta

from pystac_client import Client
from pystac_client.exceptions import APIError
from shapely.geometry import box, shape

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
    items = search(bbox, (event - window).isoformat(), (event + window).isoformat())
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
