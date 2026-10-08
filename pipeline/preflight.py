"""Checks made before a run starts, so a mistake costs seconds and not twenty minutes.

A run reads Sentinel-1 scenes for many minutes. Everything that can be known to be wrong
beforehand (a malformed area, a date that cannot work, missing credentials, nowhere to write)
is checked first and reported all at once, each with what to do about it.
"""
import os
import shutil
import tempfile
from datetime import date, timedelta
from pathlib import Path

import config as C

# The case studies are about 0.15 square degrees (roughly 45 x 45 km at this latitude). Run time
# and memory grow with area, so larger is refused and a long run is warned about.
MAX_AREA_DEG2 = 0.4
WARN_AREA_DEG2 = 0.2
MIN_SIDE_DEG = 0.005          # about 500 m
MIN_FREE_GB = 5
SENTINEL1_FIRST_DATA = date(2014, 10, 3)
# The "after" image comes at the earliest on the event day, and the pair needs about 12 days
# between its images; very recent events often have no complete pair yet.
RECENT_DAYS = 14


class PreflightError(Exception):
    """One or more things that stop the run. `problems` is the list, each a sentence with its fix."""

    def __init__(self, problems):
        self.problems = list(problems)
        super().__init__('The run cannot start:\n' + '\n'.join(f'  - {p}' for p in self.problems))


def parse_bbox(text):
    """'W,S,E,N' in degrees -> (west, south, east, north), or ValueError saying what is wrong."""
    parts = str(text).split(',')
    if len(parts) != 4:
        raise ValueError(f'The area "{text}" needs four numbers, W,S,E,N in degrees, for example 85.1,27.9,85.5,28.3.')
    try:
        west, south, east, north = (float(p) for p in parts)
    except ValueError:
        raise ValueError(f'The area "{text}" has something that is not a number. It is W,S,E,N in degrees.') from None
    if not (-180 <= west < east <= 180 and -90 <= south < north <= 90):
        raise ValueError(
            f'The area "{text}" is not W,S,E,N in degrees with west < east and south < north '
            f'(longitude comes first: Nepal is about 85, 28, not 28, 85).'
        )
    return west, south, east, north


def _have_s3_keys():
    return bool(os.environ.get('AWS_ACCESS_KEY_ID') and os.environ.get('AWS_SECRET_ACCESS_KEY'))


def check(bbox, event, out, *, need_scenes=True, optical=False, today=None):
    """Raise PreflightError listing everything wrong; otherwise return a list of warnings.

    need_scenes: the run reads Sentinel-1 scenes (False when it is given ready-made rasters).
    optical: the run also reads Sentinel-2.
    """
    today = today or date.today()
    problems, warnings = [], []

    area = None
    try:
        west, south, east, north = parse_bbox(bbox)
        area = (east - west) * (north - south)
        if min(east - west, north - south) < MIN_SIDE_DEG:
            problems.append(f'The area is under {MIN_SIDE_DEG * 111:.1f} km on a side, too small to hold a river valley.')
        elif area > MAX_AREA_DEG2:
            problems.append(
                f'The area is {area:.2f} square degrees, larger than anything this pipeline has run on '
                f'(the case studies are about 0.15; the limit is {MAX_AREA_DEG2}). Run and publish smaller areas separately.'
            )
        elif area > WARN_AREA_DEG2:
            warnings.append(f'The area is {area:.2f} square degrees, larger than the case studies (0.15): expect a long run and a lot of memory.')
        if abs(south) > 80 or abs(north) > 80:
            warnings.append('The area is near a pole. If that is not intended, the order is W,S,E,N (longitude first).')
    except ValueError as error:
        problems.append(str(error))

    day = None
    try:
        day = date.fromisoformat(str(event))
    except ValueError:
        problems.append(f'The event date "{event}" is not a date. Write it as YYYY-MM-DD, for example 2026-08-26.')
    if day is not None:
        if day > today:
            problems.append(f'The event date {day} is in the future; there are no images of it yet.')
        elif day < SENTINEL1_FIRST_DATA:
            problems.append(f'The event date {day} is before Sentinel-1 began (October 2014).')
        else:
            # The brief's data rule: only OpenStreetMap as it was before the event. The snapshot is
            # derived by config.osm_snapshot_for; this is the check that it still is.
            if date.fromisoformat(C.osm_snapshot_for(day)) >= day:
                problems.append(
                    f'The OpenStreetMap snapshot for {day} would not predate the event. Only mapping made before '
                    f'the event may be used (config.osm_snapshot_for).'
                )
            if need_scenes and day > today - timedelta(days=RECENT_DAYS):
                warnings.append(
                    f'The event is only {(today - day).days} days ago. The run needs a Sentinel-1 image on or after '
                    f'it and one about 12 days before that; the later one may not exist yet.'
                )

    if need_scenes:
        keys = _have_s3_keys()
        if not keys and not (C.CDSE_USER and C.CDSE_PASSWORD):
            problems.append(
                'No Copernicus Data Space credentials were found. Create S3 keys at '
                'https://eodata-s3keysmanager.dataspace.copernicus.eu and set AWS_ACCESS_KEY_ID and '
                'AWS_SECRET_ACCESS_KEY (on Windows, pipeline/set_cdse_keys.ps1 saves them; then open a new terminal).'
            )
        if optical and not keys:
            problems.append('--optical reads Sentinel-2 through the S3 keys (AWS_ACCESS_KEY_ID and AWS_SECRET_ACCESS_KEY); a username and password are not enough for it.')

    folder = Path(out)
    try:
        folder.mkdir(parents=True, exist_ok=True)
        with tempfile.TemporaryFile(dir=folder):
            pass
        if need_scenes:
            free_gb = shutil.disk_usage(folder).free / 1e9
            if free_gb < MIN_FREE_GB:
                warnings.append(f'Only {free_gb:.1f} GB is free where the output goes; a run caches several GB of imagery.')
    except OSError as error:
        problems.append(f'Cannot write to the output folder {folder} ({error}). Choose another with --out.')

    if problems:
        raise PreflightError(problems)
    return warnings
