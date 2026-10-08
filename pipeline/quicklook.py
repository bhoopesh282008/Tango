"""Before/after pictures for the dashboard's satellite viewer.

PNG files on the output grid, north up, shrunk to a size a browser loads
quickly. Pixels with no data (radar layover and shadow, cloud) are transparent.
"""
import json
import warnings
from pathlib import Path

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


def picture_size(shape, max_side=MAX_SIDE):
    """(rows, cols) of the picture `shrink` makes of an array of this shape, and the shrink step."""
    step = max(1, int(np.ceil(max(shape) / max_side)))
    return ((shape[0] // step, shape[1] // step) if step > 1 else tuple(shape)), step


def _path_data(geometry):
    """SVG path data for the rings of a polygon or multipolygon, to a tenth of a picture pixel."""
    polygons = getattr(geometry, 'geoms', [geometry])
    parts = []
    for polygon in polygons:
        for ring in [polygon.exterior, *polygon.interiors]:
            points = list(ring.coords)[:-1]
            if len(points) < 3:
                continue
            parts.append('M' + 'L'.join(f'{x:.1f} {y:.1f}' for x, y in points) + 'Z')
    return ''.join(parts)


def zone_outlines(zones, transform, shape, detail_window=None, max_side=MAX_SIDE, tolerance=0.5):
    """The flood zones as outlines in the pixels of the before/after pictures.

    `zones` is in the grid's own CRS and `transform` is the grid's. The whole-area pictures are
    the grid shrunk `step` times; the close-up is the grid cut at `detail_window` (row, col, rows,
    cols). Returns {'whole': {...}, 'detail': {...} or None}, each with the picture's width and
    height and `paths`: SVG path data per zone type, in the picture's own pixels, so the viewer
    draws them over the picture with no map arithmetic. `tolerance` is in grid cells: the zones
    come from a raster and are staircases, and half a cell is below what any picture can show.
    """
    from shapely.affinity import affine_transform

    (rows, cols), step = picture_size(shape, max_side)
    inverse = ~transform                      # map x, y -> grid column, row

    def outlines(row0, col0, height, width, scale):
        matrix = [inverse.a / scale, inverse.b / scale, inverse.d / scale, inverse.e / scale,
                  (inverse.c - col0) / scale, (inverse.f - row0) / scale]
        grouped = {}
        for kind, geometry in zip(zones['type'], zones.geometry):
            moved = affine_transform(geometry.simplify(tolerance * abs(transform.a)), matrix)
            x0, y0, x1, y1 = moved.bounds
            if x1 < 0 or y1 < 0 or x0 > width or y0 > height:
                continue                      # not in this picture
            grouped.setdefault(kind, []).append(_path_data(moved))
        return {'width': width, 'height': height, 'paths': {k: ''.join(v) for k, v in grouped.items() if ''.join(v)}}

    whole = outlines(0, 0, rows, cols, step)
    detail = None
    if detail_window:
        row, col, d_rows, d_cols = detail_window
        detail = outlines(row, col, d_rows, d_cols, 1)
    return {'whole': whole, 'detail': detail}


def write_outlines(out, outlines):
    """Write outlines.json beside the pictures, unless no zone shows in any of them."""
    shown = any(view and view['paths'] for view in outlines.values())
    path = Path(out) / 'outlines.json'
    if not shown:
        path.unlink(missing_ok=True)          # a rerun that found no flood must not leave the last one's
        return False
    path.write_text(json.dumps(outlines, separators=(',', ':')), encoding='utf-8')
    return True


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
