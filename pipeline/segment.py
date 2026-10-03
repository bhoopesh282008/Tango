"""Flood / debris classification from a before-and-after Sentinel-1 pair.

This is the change-detection baseline. Inputs are co-registered backscatter
rasters in dB from the same orbit track.
"""
import numpy as np
import rasterio.features
import geopandas as gpd
from shapely.geometry import shape

import config as C


def classify(pre_db, post_db, slope_deg=None):
    """Return (classes, confidence) arrays. NaN input pixels are class 0."""
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
