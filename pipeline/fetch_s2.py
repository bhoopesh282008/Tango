"""Sentinel-2 optical evidence, for when the sky is clear.

Radar is the primary sensor because it sees through monsoon cloud. Optical
images add two things: they confirm what radar found, and they see steep
slopes that radar cannot (layover, shadow). Over the Himalaya in monsoon most
Sentinel-2 passes are cloudy, so instead of one scene this builds a per-pixel
composite: the latest clear look before the event and the earliest clear look
after it, using the scene classification layer to reject cloud, cloud shadow,
terrain shadow and snow.

Reading scenes needs the Copernicus Data Space S3 keys (see download.py).
"""
from datetime import date, timedelta
from pathlib import Path

import numpy as np
import rasterio
from pystac_client import Client
from rasterio.enums import Resampling
from rasterio.vrt import WarpedVRT
from scipy import ndimage

import config as C
import download
from fetch_s1 import STAC_URL, coverage

BANDS = {'green': 'B03_10m', 'red': 'B04_10m', 'nir': 'B08_10m', 'swir': 'B11_20m'}
SCL = 'SCL_20m'
# Scene classification values taken as a clear view of the ground:
# vegetation, bare soil, water, unclassified. Left out: no data, saturated,
# dark area (terrain shadow), cloud shadow, clouds, cirrus, snow.
CLEAR_SCL = (4, 5, 6, 7)

NEW_WATER_MNDWI = 0.1      # water index after the event
DRY_BEFORE_MNDWI = 0.0     # and not water before it
VEGETATED_NDVI = 0.4       # debris: vegetation that was there before ...
NDVI_LOSS = 0.3            # ... and is gone afterwards

OPTICAL_NONE, OPTICAL_WATER, OPTICAL_DEBRIS = 0, 1, 2


def search(bbox, start, end):
    client = Client.open(STAC_URL)
    result = client.search(collections=['sentinel-2-l2a'], bbox=[float(v) for v in bbox.split(',')],
                           datetime=f'{start}/{end}', max_items=500)
    return list(result.items())


def acquisitions(items, bbox=None, min_coverage=0.9):
    """Group tiles of one overpass: [(datetime string, [items])], oldest first.

    An overpass is kept only if its tiles together cover most of the area.
    """
    groups = {}
    for item in items:
        groups.setdefault(item.properties['datetime'][:13], []).append(item)
    kept = []
    for key in sorted(groups):
        tiles = groups[key]
        if sum(coverage(t, bbox) for t in tiles) >= min_coverage:
            kept.append((tiles[0].properties['datetime'], tiles))
    return kept


def reflectance(dn, baseline):
    """Surface reflectance from L2A digital numbers; 0 is no data."""
    offset = 1000 if float(baseline or 5) >= 4 else 0   # products since baseline 04.00 carry an offset
    out = (dn.astype('float32') - offset) / 10000
    out[dn == 0] = np.nan
    return out


def read_acquisition(tiles, crs, transform, shape):
    """Bands and clear mask of one overpass on the output grid (tiles mosaicked)."""
    out = {name: np.full(shape, np.nan, 'float32') for name in BANDS}
    scl = np.zeros(shape, 'uint8')
    with rasterio.Env(**download.s3_env()):
        for tile in tiles:
            baseline = tile.properties.get('processing:version')

            def warp(asset, resampling, dtype):
                with rasterio.open(download.vsis3(tile.assets[asset].href)) as src, WarpedVRT(
                        src, crs=crs, transform=transform, width=shape[1], height=shape[0],
                        resampling=resampling) as vrt:
                    return vrt.read(1).astype(dtype)

            tile_scl = warp(SCL, Resampling.nearest, 'uint8')
            here = tile_scl > 0
            scl[here] = tile_scl[here]
            for name, asset in BANDS.items():
                band = reflectance(warp(asset, Resampling.bilinear, 'uint16'), baseline)
                out[name] = np.where(here & np.isfinite(band), band, out[name])
    out['clear'] = np.isin(scl, CLEAR_SCL) & np.all([np.isfinite(out[n]) for n in BANDS], axis=0)
    return out


def composite(looks):
    """First clear value per pixel over a list of acquisitions, in the order given.

    Returns the band arrays, a `clear` mask of pixels that got a value, and
    `source`: the index of the acquisition each pixel came from (-1 for none).
    """
    shape = looks[0]['clear'].shape
    out = {name: np.full(shape, np.nan, 'float32') for name in BANDS}
    source = np.full(shape, -1, 'int16')
    for index, look in enumerate(looks):
        take = look['clear'] & (source < 0)
        for name in BANDS:
            out[name][take] = look[name][take]
        source[take] = index
    out['clear'] = source >= 0
    out['source'] = source
    return out


def indices(look):
    """Water index (MNDWI) and vegetation index (NDVI)."""
    with np.errstate(divide='ignore', invalid='ignore'):
        mndwi = (look['green'] - look['swir']) / (look['green'] + look['swir'])
        ndvi = (look['nir'] - look['red']) / (look['nir'] + look['red'])
    return mndwi, ndvi


def classify(before, after):
    """(classes, valid): new water and stripped vegetation between two clear looks."""
    valid = before['clear'] & after['clear']
    water_before, green_before = indices(before)
    water_after, green_after = indices(after)
    with np.errstate(invalid='ignore'):
        water = valid & (water_after > NEW_WATER_MNDWI) & (water_before <= DRY_BEFORE_MNDWI)
        debris = valid & ~water & (green_before > VEGETATED_NDVI) & (green_before - green_after > NDVI_LOSS)
    classes = np.zeros(valid.shape, 'uint8')
    classes[water] = OPTICAL_WATER
    classes[debris] = OPTICAL_DEBRIS
    return classes, valid


def fuse(radar_classes, radar_conf, radar_seen, optical_classes, optical_valid, floor=None,
         min_pixels=C.SLOPE_MIN_PIXELS):
    """Combine the radar map with optical evidence. Optical never removes a radar detection.

    - Both agree on water or debris: confidence raised to at least 0.9.
    - Radar could not see the pixel (layover, shadow, steep slope) and optical
      finds water or debris: taken from optical at confidence 0.6.
    - Radar saw the pixel, found nothing, and optical finds change: "uncertain".
      The optical look may be days later than the radar one, so this is a
      prompt to check, not a detection.

    `floor` is the valley-floor mask the radar rule uses, and optical follows
    the same rule: a flood class only on the floor. Away from it a flood cannot
    be the cause (cloud edges, haze, harvest and landslides all change the
    indices), so only patches of at least `min_pixels` are kept, as "uncertain".
    """
    classes, conf = radar_classes.copy(), radar_conf.copy()
    optical_class = np.where(optical_classes == OPTICAL_WATER, C.CLASS_WATER,
                             np.where(optical_classes == OPTICAL_DEBRIS, C.CLASS_DEBRIS, C.CLASS_NONE))
    found = optical_valid & (optical_class != C.CLASS_NONE)

    agree = found & (classes == optical_class)
    conf[agree] = np.maximum(conf[agree], 0.9)

    on_floor = np.ones(classes.shape, bool) if floor is None else floor
    blind = found & ~radar_seen & on_floor
    classes[blind], conf[blind] = optical_class[blind], 0.6

    extra = found & radar_seen & on_floor & (classes == C.CLASS_NONE)
    classes[extra], conf[extra] = C.CLASS_UNCERTAIN, 0.4

    slope = found & ~on_floor & (classes == C.CLASS_NONE)
    labels, _ = ndimage.label(slope)
    large = slope & (np.bincount(labels.ravel())[labels] >= min_pixels)
    classes[large], conf[large] = C.CLASS_UNCERTAIN, 0.4
    return classes, conf, {'confirmed': int(agree.sum()), 'filled_blind_spots': int(blind.sum()),
                           'optical_only': int(extra.sum()), 'off_floor_kept': int(large.sum()),
                           'off_floor_dropped': int((slope & ~large).sum())}


def _load(path, dates, shape):
    """A saved composite, if it was built from the same passes on the same grid."""
    if path is None or not path.exists():
        return None
    with np.load(path) as saved:
        if list(saved['dates']) != dates or saved['clear'].shape != tuple(shape):
            return None
        return {name: saved[name] for name in (*BANDS, 'clear', 'source')}


def _composite(passes, crs, transform, shape, path):
    dates = [p[0][:10] for p in passes]
    look = _load(path, dates, shape)
    if look is None:
        look = composite([read_acquisition(tiles, crs, transform, shape) for _, tiles in passes])
        if path is not None:
            path.parent.mkdir(parents=True, exist_ok=True)
            np.savez_compressed(path, dates=np.array(dates), **look)
    return look


def looks_around(bbox, event_day, crs, transform, shape, days_before=45, days_after=30, max_looks=4, cache=None):
    """(before, after, info): clear composites either side of the event, or (None, None, info).

    With `cache` (a folder) the composites are saved there and reused by a later
    run that finds the same passes, since reading them takes many minutes.
    """
    event = date.fromisoformat(event_day) if isinstance(event_day, str) else event_day
    items = search(bbox, (event - timedelta(days=days_before)).isoformat(),
                   (event + timedelta(days=days_after)).isoformat())
    passes = acquisitions(items, bbox)
    # The event day itself is left out: the pass may be before or after the flood.
    earlier = [p for p in passes if p[0][:10] < event.isoformat()][::-1][:max_looks]   # latest first
    later = [p for p in passes if p[0][:10] > event.isoformat()][:max_looks]           # earliest first
    info = {'before': [p[0][:10] for p in earlier], 'after': [p[0][:10] for p in later]}
    if not earlier or not later:
        return None, None, info
    cache = Path(cache) if cache else None
    before = _composite(earlier, crs, transform, shape, cache and cache / 'optical_before.npz')
    after = _composite(later, crs, transform, shape, cache and cache / 'optical_after.npz')
    info['clear_before'] = round(float(before['clear'].mean()), 3)
    info['clear_after'] = round(float(after['clear'].mean()), 3)
    info['clear_both'] = round(float((before['clear'] & after['clear']).mean()), 3)
    return before, after, info
