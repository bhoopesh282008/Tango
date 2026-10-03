"""Find a same-orbit Sentinel-1 before/after pair on the Copernicus Data Space.

Searching is open; downloading needs a free CDSE account (CDSE_USER and
CDSE_PASSWORD in the environment). Downloads are large, about 1 GB a scene.
"""
from datetime import date, datetime, timedelta

from pystac_client import Client

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


def choose_pair(items, event_day, tolerance_days=3):
    """Pick (before, after) on the same track, REVISIT_DAYS apart, bracketing the event.

    Different tracks view the terrain from different angles and cannot be
    compared pixel by pixel, so a pair is only accepted within one track.
    Returns None if no such pair exists.
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
            score = abs(gap - REVISIT_DAYS) + (event_day - _day(before)).days + (_day(after) - event_day).days
            if best is None or score < best[0]:
                best = (score, before, after)
    return None if best is None else (best[1], best[2])


def find_pair(bbox, event_day, search_days=20):
    """Search around the event and return the best same-track (before, after) pair."""
    event = date.fromisoformat(event_day) if isinstance(event_day, str) else event_day
    window = timedelta(days=search_days)
    items = search(bbox, (event - window).isoformat(), (event + window).isoformat())
    pair = choose_pair(items, event)
    if pair is None:
        raise RuntimeError(
            f'No Sentinel-1 pair on one orbit track brackets {event} over {bbox} '
            f'({len(items)} scenes found within {search_days} days).'
        )
    return pair
