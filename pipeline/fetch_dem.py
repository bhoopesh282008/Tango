"""Copernicus DEM GLO-30 on a map grid, as heights above the ellipsoid.

Tiles are read from the AWS open-data bucket (no login). The DEM's heights are
above the geoid; Range-Doppler geocoding needs ellipsoid heights, so the geoid
undulation is added.
"""
import math

import numpy as np
import pyproj
import rasterio
from pyproj import Transformer
from rasterio.transform import from_origin
from rasterio.warp import Resampling, reproject
from scipy import ndimage

import config as C

TILE_URL = ('https://copernicus-dem-30m.s3.amazonaws.com/'
            'Copernicus_DSM_COG_10_{ns}{lat:02d}_00_{ew}{lon:03d}_00_DEM/'
            'Copernicus_DSM_COG_10_{ns}{lat:02d}_00_{ew}{lon:03d}_00_DEM.tif')


def tile_urls(west, south, east, north):
    urls = []
    for lat in range(math.floor(south), math.floor(north) + 1):
        for lon in range(math.floor(west), math.floor(east) + 1):
            urls.append(TILE_URL.format(ns='N' if lat >= 0 else 'S', lat=abs(lat),
                                        ew='E' if lon >= 0 else 'W', lon=abs(lon)))
    return urls


def grid_transform(xs, ys):
    res = float(xs[1] - xs[0])
    return from_origin(xs[0] - res / 2, ys[0] + res / 2, res, res)


def geoid_undulation(crs, xs, ys, step=100):
    """Geoid height above the ellipsoid on the grid (EGM96, interpolated)."""
    pyproj.network.set_network_enabled(True)
    cols = np.unique(np.append(np.arange(0, len(xs), step), len(xs) - 1))
    rows = np.unique(np.append(np.arange(0, len(ys), step), len(ys) - 1))
    xx, yy = np.meshgrid(xs[cols], ys[rows])
    lon, lat = Transformer.from_crs(crs, 'EPSG:4326', always_xy=True).transform(xx, yy)
    tf = Transformer.from_crs('EPSG:4326+5773', 'EPSG:4979', always_xy=True)
    _, _, h = tf.transform(lon, lat, np.zeros_like(lon))
    if not np.isfinite(h).all() or np.allclose(h, 0):
        raise RuntimeError('Geoid grid unavailable (PROJ could not fetch us_nga_egm96_15.tif)')
    rr, cc = np.meshgrid(np.interp(np.arange(len(ys)), rows, np.arange(len(rows))),
                         np.interp(np.arange(len(xs)), cols, np.arange(len(cols))), indexing='ij')
    return ndimage.map_coordinates(h, [rr, cc], order=1).astype('float32')


def fetch(crs, xs, ys, use_cache=True):
    """Ellipsoid heights (float32, rows follow ys) for the grid."""
    # Grids in degrees need the decimals to tell them apart; metric grids keep their whole-metre names.
    digits = 5 if abs(xs[1] - xs[0]) < 1 else 0
    name = (f'dem_{crs.split(":")[1]}_{xs[0]:.{digits}f}_{ys[0]:.{digits}f}_'
            f'{len(xs)}x{len(ys)}_{xs[1] - xs[0]:.{digits}f}.tif')
    cache = C.CACHE / 'dem' / name
    transform = grid_transform(xs, ys)
    if use_cache and cache.exists():
        with rasterio.open(cache) as src:
            return src.read(1)

    to_geo = Transformer.from_crs(crs, 'EPSG:4326', always_xy=True)
    lon, lat = to_geo.transform([xs[0], xs[-1], xs[0], xs[-1]], [ys[0], ys[0], ys[-1], ys[-1]])
    height = np.full((len(ys), len(xs)), np.nan, 'float32')
    for url in tile_urls(min(lon), min(lat), max(lon), max(lat)):
        try:
            src = rasterio.open(url)
        except rasterio.errors.RasterioIOError:
            continue  # no tile: open sea
        with src:
            part = np.full(height.shape, np.nan, 'float32')
            reproject(rasterio.band(src, 1), part, dst_transform=transform, dst_crs=crs,
                      dst_nodata=np.nan, resampling=Resampling.bilinear)
        height = np.where(np.isfinite(part), part, height)
    if not np.isfinite(height).any():
        raise RuntimeError('No Copernicus DEM tiles found for this area')
    height = np.nan_to_num(height, nan=0.0) + geoid_undulation(crs, xs, ys)

    cache.parent.mkdir(parents=True, exist_ok=True)
    with rasterio.open(cache, 'w', driver='GTiff', height=height.shape[0], width=height.shape[1],
                       count=1, dtype='float32', crs=crs, transform=transform, compress='deflate') as dst:
        dst.write(height, 1)
    return height
