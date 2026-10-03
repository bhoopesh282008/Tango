"""Sentinel-1 GRD preprocessing from the raw Level-1 product, without SNAP.

Steps: parse the annotation, calibrate to sigma0, speckle-filter, then
Range-Doppler terrain correction onto a UTM grid using a DEM, with layover
and shadow masked. Output is backscatter in dB.
"""
import xml.etree.ElementTree as ET
from dataclasses import dataclass, field

import numpy as np
from numpy.polynomial import Polynomial
from pyproj import Transformer
from scipy import ndimage

GRD_ENL = 4.4  # equivalent number of looks of IW GRDH, for the Lee filter


# --------------------------------------------------------------- annotation

@dataclass
class Annotation:
    epoch: np.datetime64
    t_first_line: float          # seconds after epoch
    line_interval: float         # seconds per line
    range_spacing: float         # metres per ground-range pixel
    n_lines: int
    n_samples: int
    orbit_t: np.ndarray
    orbit_pos: np.ndarray        # (n, 3) ECEF metres
    srgr_t: np.ndarray           # azimuth time of each conversion record
    srgr_sr0: np.ndarray
    srgr_coeffs: list            # slant range -> ground range polynomials
    grid: dict = field(default_factory=dict)  # geolocation grid arrays
    srgr_shift: float = 0.0      # seconds added to srgr_t; see fit_srgr_shift


def _secs(text, epoch):
    return float((np.datetime64(text) - epoch) / np.timedelta64(1, 'ns')) * 1e-9


def _floats(text):
    return np.array(text.split(), dtype=float)


def parse_annotation(xml_text):
    root = ET.fromstring(xml_text)
    orbits = root.findall('.//orbitList/orbit')
    epoch = np.datetime64(orbits[0].findtext('time'))
    info = root.find('.//imageAnnotation/imageInformation')
    conversions = root.findall('.//coordinateConversionList/coordinateConversion')
    points = root.findall('.//geolocationGridPointList/geolocationGridPoint')
    ann = Annotation(
        epoch=epoch,
        t_first_line=_secs(info.findtext('productFirstLineUtcTime'), epoch),
        line_interval=float(info.findtext('azimuthTimeInterval')),
        range_spacing=float(info.findtext('rangePixelSpacing')),
        n_lines=int(info.findtext('numberOfLines')),
        n_samples=int(info.findtext('numberOfSamples')),
        orbit_t=np.array([_secs(o.findtext('time'), epoch) for o in orbits]),
        orbit_pos=np.array([[float(o.findtext(f'position/{a}')) for a in 'xyz'] for o in orbits]),
        srgr_t=np.array([_secs(c.findtext('azimuthTime'), epoch) for c in conversions]),
        srgr_sr0=np.array([float(c.findtext('sr0')) for c in conversions]),
        srgr_coeffs=[_floats(c.findtext('srgrCoefficients')) for c in conversions],
        grid={
            key: np.array([float(p.findtext(tag)) for p in points])
            for key, tag in [('line', 'line'), ('pixel', 'pixel'), ('lat', 'latitude'),
                             ('lon', 'longitude'), ('height', 'height')]
        },
    )
    ann.srgr_shift = fit_srgr_shift(ann)
    return ann


# -------------------------------------------------------------------- orbit

class Orbit:
    """Polynomial fit to the annotation's ECEF state vectors."""

    def __init__(self, t, pos):
        degree = min(len(t) - 1, 6)
        self._p = [Polynomial.fit(t, pos[:, i], degree) for i in range(3)]
        self._v = [p.deriv() for p in self._p]
        self._a = [p.deriv(2) for p in self._p]

    def pos(self, t):
        return np.stack([p(t) for p in self._p], axis=-1)

    def vel(self, t):
        return np.stack([p(t) for p in self._v], axis=-1)

    def acc(self, t):
        return np.stack([p(t) for p in self._a], axis=-1)


def zero_doppler(orbit, target, t_init, iterations=10):
    """Time at which each ECEF target is broadside to the sensor, and its range.

    Solves (target - S(t)) . V(t) = 0 by Newton iteration.
    """
    t = np.full(target.shape[:-1], float(t_init))
    for _ in range(iterations):
        d = target - orbit.pos(t)
        v = orbit.vel(t)
        f = np.sum(d * v, axis=-1)
        fp = np.sum(d * orbit.acc(t), axis=-1) - np.sum(v * v, axis=-1)
        t = t - f / fp
    return t, np.linalg.norm(target - orbit.pos(t), axis=-1)


def slant_to_pixel(ann, slant_range, t, shift=None):
    """Slant range (m) at azimuth time t -> ground-range pixel index.

    The conversion polynomials change along the track (the terrain height used
    for ground projection changes), and the image varies smoothly between
    them, so neighbouring records are blended in time.
    """
    def ground(k):
        return np.polynomial.polynomial.polyval(slant_range - ann.srgr_sr0[k], ann.srgr_coeffs[k])

    n = len(ann.srgr_t)
    if n == 1:
        return ground(0) / ann.range_spacing
    times = ann.srgr_t + (ann.srgr_shift if shift is None else shift)
    idx = np.clip(np.searchsorted(times, t) - 1, 0, n - 2)
    span = times[idx + 1] - times[idx]
    w = np.clip((t - times[idx]) / span, 0, 1)
    out = np.zeros_like(slant_range, dtype=float)
    for k in range(n):
        g = None
        lower, upper = idx == k, idx + 1 == k
        if lower.any() or upper.any():
            g = ground(k)
            out += np.where(lower, (1 - w) * g, 0) + np.where(upper, w * g, 0)
    return out / ann.range_spacing


def fit_srgr_shift(ann):
    """Time offset of the slant-to-ground conversion records, from the product's own grid.

    On real products the records are not exact at their stated azimuth time:
    blending them as stamped leaves the annotation's geolocation grid off by
    several pixels where the terrain height changes quickly. Shifting the
    record times by a fraction of their spacing reproduces the grid to a
    hundredth of a pixel, and gives the sharper match between the geocoded
    image and the terrain. The shift is found by trying offsets within half a
    record spacing either way and keeping the one that best reproduces the grid.
    """
    g = ann.grid
    if len(ann.srgr_t) < 2 or not len(g.get('line', [])) or len(ann.orbit_t) < 2:
        return 0.0
    to_ecef = Transformer.from_crs('EPSG:4979', 'EPSG:4978', always_xy=True)
    target = np.stack(to_ecef.transform(g['lon'], g['lat'], g['height']), axis=-1)
    t, slant = zero_doppler(Orbit(ann.orbit_t, ann.orbit_pos), target,
                            ann.t_first_line + ann.line_interval * ann.n_lines / 2)
    spacing = float(np.median(np.diff(ann.srgr_t)))

    def error(shift):
        return float(np.mean(np.abs(slant_to_pixel(ann, slant, t, shift) - g['pixel'])))

    coarse = np.linspace(-0.5, 0.5, 201) * spacing
    best = min(coarse, key=error)
    fine = best + np.linspace(-1, 1, 81) * (coarse[1] - coarse[0])
    best = min(fine, key=error)
    # Keep the stated times unless shifting them is clearly better.
    return float(best) if error(best) < 0.5 * error(0.0) else 0.0


def locate(ann, orbit, lon, lat, height):
    """Geographic position (ellipsoid height) -> (line, pixel, satellite ECEF, target ECEF)."""
    to_ecef = Transformer.from_crs('EPSG:4979', 'EPSG:4978', always_xy=True)
    target = np.stack(to_ecef.transform(lon, lat, height), axis=-1)
    t_mid = ann.t_first_line + ann.line_interval * ann.n_lines / 2
    t, slant = zero_doppler(orbit, target, t_mid)
    line = (t - ann.t_first_line) / ann.line_interval
    pixel = slant_to_pixel(ann, slant, t)
    return line, pixel, orbit.pos(t), target


def check_geolocation(ann):
    """Reproduce the annotation's own geolocation grid; returns error stats in pixels."""
    g = ann.grid
    line, pixel, _, _ = locate(ann, Orbit(ann.orbit_t, ann.orbit_pos), g['lon'], g['lat'], g['height'])
    dl, dp = np.abs(line - g['line']), np.abs(pixel - g['pixel'])
    return {'line_max': float(dl.max()), 'line_median': float(np.median(dl)),
            'pixel_max': float(dp.max()), 'pixel_median': float(np.median(dp))}


# -------------------------------------------------------------- calibration

def parse_lut(xml_text, vector_tag, value_tag):
    """Read calibration or noise vectors: (lines, [pixels], [values])."""
    root = ET.fromstring(xml_text)
    lines, pixels, values = [], [], []
    for v in root.iter(vector_tag):
        lines.append(float(v.findtext('line')))
        pixels.append(_floats(v.findtext('pixel')))
        values.append(_floats(v.findtext(value_tag)))
    order = np.argsort(lines)
    return np.array(lines)[order], [pixels[i] for i in order], [values[i] for i in order]


def parse_calibration(xml_text):
    return parse_lut(xml_text, 'calibrationVector', 'sigmaNought')


def parse_noise(xml_text):
    lut = parse_lut(xml_text, 'noiseRangeVector', 'noiseRangeLut')
    return lut if len(lut[0]) else parse_lut(xml_text, 'noiseVector', 'noiseLut')


def lut_window(lut, rows, cols):
    """Bilinear interpolation of LUT vectors onto a window (rows x cols index arrays)."""
    lines, pixels, values = lut
    per_vector = np.stack([np.interp(cols, p, v) for p, v in zip(pixels, values)])
    if len(lines) == 1:
        return np.repeat(per_vector, len(rows), axis=0)
    i = np.clip(np.searchsorted(lines, rows) - 1, 0, len(lines) - 2)
    w = np.clip((rows - lines[i]) / (lines[i + 1] - lines[i]), 0, 1)[:, None]
    return per_vector[i] * (1 - w) + per_vector[i + 1] * w


def calibrate(dn, cal, noise=None):
    """sigma0 (linear power) = (DN^2 - noise) / LUT^2. DN 0 is no-data."""
    dn = dn.astype('float32')
    power = dn * dn
    if noise is not None:
        power = np.maximum(power - noise, 0)
    sigma0 = power / (cal * cal)
    sigma0[dn == 0] = np.nan
    return sigma0.astype('float32')


# ------------------------------------------------------------------ speckle

def lee_filter(img, size=5, enl=GRD_ENL):
    """Lee speckle filter on linear power; NaNs are ignored and preserved."""
    valid = np.isfinite(img)
    filled = np.where(valid, img, 0).astype('float64')
    count = ndimage.uniform_filter(valid.astype('float64'), size)
    with np.errstate(invalid='ignore', divide='ignore'):
        mean = ndimage.uniform_filter(filled, size) / count
        var = np.maximum(ndimage.uniform_filter(filled * filled, size) / count - mean * mean, 0)
        ci2 = var / (mean * mean)
        weight = np.where(ci2 > 0, np.clip(1 - (1 / enl) / ci2, 0, 1), 0)
        out = mean + weight * (img - mean)
    out[~valid] = np.nan
    return out.astype('float32')


def to_db(power):
    with np.errstate(divide='ignore', invalid='ignore'):
        db = 10 * np.log10(power)
    db[~np.isfinite(db)] = np.nan
    return db.astype('float32')


# ---------------------------------------------------------------- geocoding

def utm_crs(bbox):
    west, south, east, north = bbox
    zone = int(((west + east) / 2 + 180) // 6) + 1
    return f'EPSG:{(32600 if (south + north) / 2 >= 0 else 32700) + zone}'


def make_grid(bbox, res=10.0):
    """UTM grid covering a lon/lat bbox: (crs, xs, ys) with ys north to south."""
    crs = utm_crs(bbox)
    west, south, east, north = bbox
    tf = Transformer.from_crs('EPSG:4326', crs, always_xy=True)
    cx, cy = tf.transform([west, east, west, east], [south, south, north, north])
    x0, x1 = np.floor(min(cx) / res) * res, np.ceil(max(cx) / res) * res
    y0, y1 = np.floor(min(cy) / res) * res, np.ceil(max(cy) / res) * res
    xs = np.arange(x0 + res / 2, x1, res)
    ys = np.arange(y1 - res / 2, y0, -res)
    return crs, xs, ys


def geocode(ann, crs, xs, ys, height, block=256):
    """Radar coordinates and viewing geometry for every cell of a map grid.

    height: ellipsoid heights on the grid (rows follow ys). Returns line,
    pixel, cos of the local incidence angle, and layover / shadow masks.
    """
    orbit = Orbit(ann.orbit_t, ann.orbit_pos)
    to_geo = Transformer.from_crs(crs, 'EPSG:4326', always_xy=True)
    res = float(xs[1] - xs[0])
    shape = (len(ys), len(xs))
    line = np.empty(shape, 'float32')
    pixel = np.empty(shape, 'float32')
    cos_lia = np.empty(shape, 'float32')
    away_e = np.empty(shape, 'float32')
    away_n = np.empty(shape, 'float32')

    dz_drow, dz_dcol = np.gradient(height, res)
    dz_dnorth, dz_deast = -dz_drow, dz_dcol
    norm = np.sqrt(dz_deast ** 2 + dz_dnorth ** 2 + 1)

    for r0 in range(0, shape[0], block):
        sl = slice(r0, min(r0 + block, shape[0]))
        xx, yy = np.meshgrid(xs, ys[sl])
        lon, lat = to_geo.transform(xx, yy)
        ln, px, sat, target = locate(ann, orbit, lon, lat, height[sl])
        line[sl], pixel[sl] = ln, px

        # Vector from the ground to the satellite, in local east/north/up.
        d = sat - target
        d /= np.linalg.norm(d, axis=-1, keepdims=True)
        la, lo = np.radians(lat), np.radians(lon)
        east = -np.sin(lo) * d[..., 0] + np.cos(lo) * d[..., 1]
        north = (-np.sin(la) * np.cos(lo) * d[..., 0] - np.sin(la) * np.sin(lo) * d[..., 1]
                 + np.cos(la) * d[..., 2])
        up = (np.cos(la) * np.cos(lo) * d[..., 0] + np.cos(la) * np.sin(lo) * d[..., 1]
              + np.sin(la) * d[..., 2])
        cos_lia[sl] = (-dz_deast[sl] * east - dz_dnorth[sl] * north + up) / norm[sl]
        horizontal = np.hypot(east, north)
        away_e[sl], away_n[sl] = -east / horizontal, -north / horizontal

    # Layover: range stops increasing as you walk away from the sensor.
    dp_drow, dp_dcol = np.gradient(pixel.astype('float64'), res)
    range_slope = dp_dcol * away_e - dp_drow * away_n
    return {
        'line': line, 'pixel': pixel, 'cos_lia': cos_lia,
        'layover': range_slope <= 0, 'shadow': cos_lia <= 0,
        'slope_deg': np.degrees(np.arctan(np.hypot(dz_deast, dz_dnorth))).astype('float32'),
    }


def radar_window(geo, ann, margin=8):
    """Row/column window of the radar image needed to fill the grid."""
    r0 = max(int(np.floor(np.nanmin(geo['line']))) - margin, 0)
    r1 = min(int(np.ceil(np.nanmax(geo['line']))) + margin, ann.n_lines)
    c0 = max(int(np.floor(np.nanmin(geo['pixel']))) - margin, 0)
    c1 = min(int(np.ceil(np.nanmax(geo['pixel']))) + margin, ann.n_samples)
    if r1 <= r0 or c1 <= c0:
        raise ValueError('The scene does not cover the requested area')
    return r0, r1, c0, c1


def terrain_correct(dn_window, window, geo, cal_lut, noise_lut=None, speckle=True):
    """Calibrate a DN window and resample it onto the map grid, in dB."""
    r0, r1, c0, c1 = window
    rows, cols = np.arange(r0, r1), np.arange(c0, c1)
    noise = lut_window(noise_lut, rows, cols) if noise_lut is not None else None
    sigma0 = calibrate(dn_window, lut_window(cal_lut, rows, cols), noise)
    if speckle:
        sigma0 = lee_filter(sigma0)
    coords = np.stack([geo['line'] - r0, geo['pixel'] - c0])
    out = ndimage.map_coordinates(sigma0, coords, order=1, mode='constant', cval=np.nan)
    out[geo['layover'] | geo['shadow']] = np.nan
    return to_db(out)
