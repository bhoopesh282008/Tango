"""Flood / debris classification from a before-and-after Sentinel-1 pair.

This is the change-detection baseline. Inputs are co-registered backscatter
rasters in dB from the same orbit track.
"""
import numpy as np
import rasterio.features
from scipy import ndimage
import geopandas as gpd
from shapely.geometry import shape

import config as C


def temporal_baseline(stack):
    """(median, spread) of earlier images of the same place, each in dB, stacked (n, rows, cols).

    The median is the "before" picture, steadier than any single image (speckle, a passing shower,
    a river a little higher that day). The spread is a robust standard deviation (1.4826 times the
    median absolute deviation) of each pixel across the images, smoothed over a few pixels: how much
    that ground changes anyway. Needs at least three images; with fewer there is no spread to speak of.
    """
    stack = np.asarray(stack, dtype='float32')
    if stack.ndim != 3 or stack.shape[0] < 3:
        raise ValueError('A baseline needs at least three earlier images.')
    median = np.nanmedian(stack, axis=0)
    spread = 1.4826 * np.nanmedian(np.abs(stack - median), axis=0)
    spread = ndimage.median_filter(np.where(np.isfinite(spread), spread, 0.0), size=C.SIGMA_SMOOTHING)
    return median, spread.astype('float32')


def classify_on_floor(pre_db, post_db, floor, spread=None, k=None):
    """Change detection constrained by terrain. Returns (classes, confidence).

    With `spread` (from temporal_baseline), a change counts only if it also exceeds k times the
    spread there, so ground that varies a lot between flood-free images needs a bigger change to
    be called flood than steady ground does. Without it, the fixed thresholds below apply.

    On the valley floor a drop of 3 dB is new water or wet sediment and a rise
    of 3 dB is debris. No absolute darkness is required: a river tens of
    metres wide in a gorge never looks like open water at 10 m. Away from the
    floor a flood cannot be the cause, so only strong change over at least a
    hectare is kept, as 'uncertain'. The change image is median-filtered first
    so that single-pixel speckle does not pass a threshold.
    """
    valid = np.isfinite(pre_db) & np.isfinite(post_db)
    diff = ndimage.median_filter(np.where(valid, post_db - pre_db, 0.0), size=3)

    if spread is None:
        drop, rise = C.WATER_DROP_DB, C.DEBRIS_RISE_DB
    else:
        # per-pixel thresholds, never below the fixed ones
        k = C.BASELINE_SIGMA_K if k is None else k
        drop = np.minimum(C.WATER_DROP_DB, -k * spread)
        rise = np.maximum(C.DEBRIS_RISE_DB, k * spread)
    water = valid & floor & (diff < drop)
    debris = valid & floor & (diff > rise)
    strong = valid & ~floor & (np.abs(diff) > C.SLOPE_CHANGE_DB)
    labels, _ = ndimage.label(strong)
    sizes = np.bincount(labels.ravel())
    uncertain = strong & (sizes[labels] >= C.SLOPE_MIN_PIXELS)

    classes = np.zeros(post_db.shape, dtype=np.uint8)
    classes[water] = C.CLASS_WATER
    classes[debris] = C.CLASS_DEBRIS
    classes[uncertain] = C.CLASS_UNCERTAIN
    conf = np.zeros(post_db.shape, dtype=np.float32)
    conf[water] = np.clip(0.6 + 0.4 * (-diff[water] - 3) / 9, 0.6, 1.0)
    conf[debris] = np.clip(0.6 + 0.4 * (diff[debris] - 3) / 9, 0.6, 1.0)
    conf[uncertain] = 0.4
    return classes, conf


def classify(pre_db, post_db, slope_deg=None, floor=None, spread=None):
    """Return (classes, confidence) arrays. NaN input pixels are class 0.

    With a valley-floor mask the terrain-constrained rules are used; without
    one, the original rules (absolute darkness for water, a slope limit).
    `spread` (valley-floor rules only) makes the thresholds follow how much each pixel varies.
    """
    if floor is not None:
        return classify_on_floor(pre_db, post_db, floor, spread)
    diff = post_db - pre_db
    valid = np.isfinite(pre_db) & np.isfinite(post_db)
    if slope_deg is not None:
        valid &= slope_deg < C.MAX_SLOPE_DEG

    water = valid & (post_db < C.WATER_MAX_DB) & (diff < C.WATER_DROP_DB)
    debris = valid & ~water & (diff > C.DEBRIS_RISE_DB)
    weak_water = valid & ~water & ~debris & (post_db < C.WATER_MAX_DB) & (diff < C.WATER_DROP_DB * C.UNCERTAIN_FRACTION)
    weak_debris = valid & ~water & ~debris & ~weak_water & (diff > C.DEBRIS_RISE_DB * C.UNCERTAIN_FRACTION)

    classes = np.zeros(post_db.shape, dtype=np.uint8)
    classes[water] = C.CLASS_WATER
    classes[debris] = C.CLASS_DEBRIS
    classes[weak_water | weak_debris] = C.CLASS_UNCERTAIN

    # Confidence grows with how far the change exceeds its threshold.
    conf = np.zeros(post_db.shape, dtype=np.float32)
    conf[water] = np.clip(0.6 + 0.4 * (-diff[water] - 3) / 9, 0.6, 1.0)
    conf[debris] = np.clip(0.6 + 0.4 * (diff[debris] - 3) / 9, 0.6, 1.0)
    conf[classes == C.CLASS_UNCERTAIN] = 0.4
    return classes, conf


def vectorise(classes, conf, transform, crs):
    """Polygonise a class raster into a GeoDataFrame (geometry in `crs`).

    Columns: id, type, confidence, area_km2.
    """
    rows = []
    for geom, value in rasterio.features.shapes(classes, mask=classes > 0, transform=transform):
        rows.append({'class': int(value), 'geometry': shape(geom)})
    if not rows:
        return gpd.GeoDataFrame(
            {'id': [], 'type': [], 'confidence': [], 'area_km2': []}, geometry=[], crs=crs
        )
    gdf = gpd.GeoDataFrame(rows, crs=crs)
    metric = gdf.to_crs(gdf.estimate_utm_crs())
    keep = (metric.area >= C.MIN_ZONE_M2).to_numpy()
    gdf, metric = gdf[keep].copy(), metric[keep]
    gdf['type'] = gdf['class'].map(C.CLASS_NAMES)
    gdf['area_km2'] = (metric.area / 1e6).round(3)
    gdf['confidence'] = [
        round(float(conf[rasterio.features.geometry_mask([g], conf.shape, transform, invert=True)].mean()), 2)
        for g in gdf.geometry
    ]
    gdf = gdf.drop(columns='class').reset_index(drop=True)
    gdf.insert(0, 'id', [f'z{i + 1:03d}' for i in range(len(gdf))])
    return gdf
