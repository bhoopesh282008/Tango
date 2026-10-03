"""Find a same-orbit Sentinel-1 before/after pair on the Copernicus Data Space.

Searching needs no account; reading the scenes does (see download.py).
"""
from datetime import date, datetime, timedelta

from pystac_client import Client
from shapely.geometry import box, shape

STAC_URL = 'https://stac.dataspace.copernicus.eu/v1'
REVISIT_DAYS = 12


def search(bbox, start, end):
    """Sentinel-1 GRD items over bbox (W,S,E,N) between ISO dates."""
    client = Client.open(STAC_URL)
    result = client.search(
        collections=['sentinel-1-grd'],
        bbox=[float(v) for v in bbox.split(',')],
        datetime=f'{start}/{end}',
        max_items=200,
    )
    return list(result.items())


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
    Among valid pairs, one whose scenes cover the whole area comes first, then
    the one with the earliest image after the event: for rescue, days matter
    more than a slightly closer "before" scene. Returns None if no pair exists.
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
            score = (
                0 if covered >= 0.99 else 1,          # full coverage first
                -round(covered, 2),                   # otherwise the most coverage
                (_day(after) - event_day).days,       # earliest look at the flood
                (event_day - _day(before)).days,
                abs(gap - REVISIT_DAYS),
            )
            if best is None or score < best[0]:
                best = (score, before, after)
    return None if best is None else (best[1], best[2])


def find_pair(bbox, event_day, search_days=20):
    """Search around the event and return the best same-track (before, after) pair."""
    event = date.fromisoformat(event_day) if isinstance(event_day, str) else event_day
    window = timedelta(days=search_days)
    items = search(bbox, (event - window).isoformat(), (event + window).isoformat())
    pair = choose_pair(items, event, bbox=bbox)
    if pair is None:
        raise RuntimeError(
            f'No Sentinel-1 pair on one orbit track brackets {event} over {bbox} '
            f'({len(items)} scenes found within {search_days} days).'
        )
    return pair
