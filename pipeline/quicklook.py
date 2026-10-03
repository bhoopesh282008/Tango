"""Before/after pictures for the dashboard's satellite viewer.

PNG files on the output grid, north up, shrunk to a size a browser loads
quickly. Pixels with no data (radar layover and shadow, cloud) are transparent.
"""
import warnings

import numpy as np
import rasterio

MAX_SIDE = 1600
RADAR_RANGE_DB = (-25.0, 0.0)
OPTICAL_MAX_REFLECTANCE = 0.4


def shrink(array, max_side=MAX_SIDE):
    """Block-average a 2-D array so its longer side is at most max_side. NaN-aware."""
    step = max(1, int(np.ceil(max(array.shape) / max_side)))
    if step == 1:
        return array
    rows, cols = (array.shape[0] // step) * step, (array.shape[1] // step) * step
    blocks = array[:rows, :cols].reshape(rows // step, step, cols // step, step)
    with warnings.catch_warnings():
        warnings.simplefilter('ignore', RuntimeWarning)   # blocks that are all NaN stay NaN
        return np.nanmean(blocks, axis=(1, 3))


def scale(values, low, high):
    """Map [low, high] to 1..255; NaN becomes 0."""
    out = np.clip((values - low) / (high - low), 0, 1) * 254 + 1
    return np.where(np.isfinite(values), out, 0).astype('uint8')


def write_png(path, bands):
    """bands: list of uint8 arrays; the last one is the alpha channel."""
    with rasterio.Env(GDAL_PAM_ENABLED='NO'), rasterio.open(
            path, 'w', driver='PNG', height=bands[0].shape[0], width=bands[0].shape[1],
            count=len(bands), dtype='uint8') as dst:
        for i, band in enumerate(bands, 1):
            dst.write(band, i)


def radar_png(db, path):
    """Greyscale backscatter, dark water to bright rough ground."""
    small = shrink(db)
    grey = scale(small, *RADAR_RANGE_DB)
    write_png(path, [grey, np.where(np.isfinite(small), 255, 0).astype('uint8')])
    return grey.shape


def optical_png(look, path):
    """False colour (near infrared, red, green): vegetation red, water dark, bare ground pale."""
    channels = [shrink(np.where(look['clear'], look[name], np.nan)) for name in ('nir', 'red', 'green')]
    alpha = np.where(np.isfinite(channels[0]), 255, 0).astype('uint8')
    write_png(path, [scale(c, 0, OPTICAL_MAX_REFLECTANCE) for c in channels] + [alpha])
    return alpha.shape
