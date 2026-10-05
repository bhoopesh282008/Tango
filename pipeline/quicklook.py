"""Before/after pictures for the dashboard's satellite viewer.

PNG files on the output grid, north up, shrunk to a size a browser loads
quickly. Pixels with no data (radar layover and shadow, cloud) are transparent.
"""
import warnings

import numpy as np
import rasterio

MAX_SIDE = 1600
# The close-up: this many cells on a side, at the grid's own resolution (8 km at 10 m).
DETAIL_SIDE = 800
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


def densest_window(mask, side=DETAIL_SIDE):
    """(row, col, rows, cols, count): the side x side window holding the most True cells.

    The window is clipped to the array, and the first such window wins a tie.
    """
    rows, cols = min(side, mask.shape[0]), min(side, mask.shape[1])
    table = np.pad(mask.astype('int64').cumsum(0).cumsum(1), ((1, 0), (1, 0)))
    sums = table[rows:, cols:] - table[:-rows, cols:] - table[rows:, :-cols] + table[:-rows, :-cols]
    row, col = np.unravel_index(np.argmax(sums), sums.shape)
    return int(row), int(col), rows, cols, int(sums[row, col])


def detail_pngs(pre_db, post_db, flood, out, side=DETAIL_SIDE):
    """Before and after close-ups of where the map found the most flood, unshrunk.

    The whole-area pictures are shrunk about three times, which leaves a river
    change tens of metres wide a pixel or two across. `flood` is the mask of
    water and debris cells. Returns the window (row, col, rows, cols), or None
    when nothing was mapped. Both pictures use the same fixed dB range, so a
    difference between them is a difference in the scenes.
    """
    row, col, rows, cols, count = densest_window(flood, side)
    if count == 0:
        return None
    window = (slice(row, row + rows), slice(col, col + cols))
    radar_png(pre_db[window], out / 'before_detail.png', max_side=None)
    radar_png(post_db[window], out / 'after_detail.png', max_side=None)
    return row, col, rows, cols


def radar_png(db, path, max_side=MAX_SIDE):
    """Greyscale backscatter, dark water to bright rough ground."""
    small = shrink(db, max_side) if max_side else db
    grey = scale(small, *RADAR_RANGE_DB)
    write_png(path, [grey, np.where(np.isfinite(small), 255, 0).astype('uint8')])
    return grey.shape


def optical_png(look, path):
    """False colour (near infrared, red, green): vegetation red, water dark, bare ground pale."""
    channels = [shrink(np.where(look['clear'], look[name], np.nan)) for name in ('nir', 'red', 'green')]
    alpha = np.where(np.isfinite(channels[0]), 255, 0).astype('uint8')
    write_png(path, [scale(c, 0, OPTICAL_MAX_REFLECTANCE) for c in channels] + [alpha])
    return alpha.shape
