import sys
from pathlib import Path

import numpy as np

sys.path.insert(0, str(Path(__file__).parent.parent))

import preprocess_s1 as P  # noqa: E402

R_ORBIT, R_EARTH, OMEGA = 7.07e6, 6.371e6, 1.06e-3


def circular_orbit():
    t = np.arange(0, 170, 10.0)
    pos = np.stack([R_ORBIT * np.cos(OMEGA * t), np.zeros_like(t), R_ORBIT * np.sin(OMEGA * t)], -1)
    return P.Orbit(t, pos)


def test_zero_doppler_on_circular_orbit():
    # A target whose projection onto the orbital plane lies at angle theta is
    # broadside exactly when the satellite reaches theta.
    theta, alpha = OMEGA * 83.0, np.radians(4)
    target = R_EARTH * np.array([[np.cos(theta) * np.cos(alpha), np.sin(alpha), np.sin(theta) * np.cos(alpha)]])
    t, slant = P.zero_doppler(circular_orbit(), target, 20.0)
    sat = R_ORBIT * np.array([np.cos(theta), 0, np.sin(theta)])
    assert abs(t[0] - 83.0) < 1e-6
    assert abs(slant[0] - np.linalg.norm(target[0] - sat)) < 1e-3


def _ann(**kw):
    base = dict(
        epoch=np.datetime64('2026-08-24T00:00:00'), t_first_line=0.0, line_interval=0.001,
        range_spacing=10.0, n_lines=1000, n_samples=1000, orbit_t=np.array([0.0]),
        orbit_pos=np.zeros((1, 3)), srgr_t=np.array([0.0]), srgr_sr0=np.array([800000.0]),
        srgr_coeffs=[np.array([0.0, 1.5])],
    )
    return P.Annotation(**{**base, **kw})


def test_slant_to_pixel_single_record():
    px = P.slant_to_pixel(_ann(), np.array([800100.0]), np.array([0.0]))
    assert np.allclose(px, 15.0)   # 100 m slant -> 150 m ground -> pixel 15


def test_slant_to_pixel_blends_records_in_time():
    ann = _ann(srgr_t=np.array([0.0, 10.0]), srgr_sr0=np.array([800000.0, 800000.0]),
               srgr_coeffs=[np.array([0.0, 1.0]), np.array([0.0, 2.0])])
    px = P.slant_to_pixel(ann, np.full(3, 800100.0), np.array([0.0, 5.0, 10.0]))
    assert np.allclose(px, [10.0, 15.0, 20.0])


def test_calibrate_and_lut_window():
    lut = (np.array([0.0, 10.0]), [np.array([0.0, 10.0])] * 2,
           [np.array([10.0, 10.0]), np.array([20.0, 20.0])])
    window = P.lut_window(lut, np.array([0, 5, 10]), np.array([0, 5]))
    assert np.allclose(window, [[10, 10], [15, 15], [20, 20]])

    dn = np.array([[100, 0]], dtype='uint16')
    sigma0 = P.calibrate(dn, np.full((1, 2), 10.0), noise=np.full((1, 2), 1900.0))
    assert np.isclose(sigma0[0, 0], (100 ** 2 - 1900) / 100)
    assert np.isnan(sigma0[0, 1])   # DN 0 is no-data


def test_lee_filter():
    flat = np.full((20, 20), 0.3, dtype='float32')
    assert np.allclose(P.lee_filter(flat), 0.3)

    rng = np.random.default_rng(0)
    speckled = (0.3 * rng.gamma(4.4, 1 / 4.4, (200, 200))).astype('float32')
    speckled[0, 0] = np.nan
    out = P.lee_filter(speckled)
    assert np.isnan(out[0, 0])
    assert np.nanstd(out) < 0.6 * np.nanstd(speckled)
    assert abs(np.nanmean(out) - np.nanmean(speckled)) < 0.01


def test_parse_annotation():
    xml = """<product>
      <generalAnnotation><orbitList>
        <orbit><time>2026-08-24T00:18:40.000000</time><position><x>1</x><y>2</y><z>3</z></position></orbit>
        <orbit><time>2026-08-24T00:18:50.000000</time><position><x>4</x><y>5</y><z>6</z></position></orbit>
      </orbitList></generalAnnotation>
      <imageAnnotation><imageInformation>
        <productFirstLineUtcTime>2026-08-24T00:18:44.500000</productFirstLineUtcTime>
        <azimuthTimeInterval>1.5e-03</azimuthTimeInterval><rangePixelSpacing>10</rangePixelSpacing>
        <numberOfSamples>25000</numberOfSamples><numberOfLines>16000</numberOfLines>
      </imageInformation></imageAnnotation>
      <coordinateConversion><coordinateConversionList>
        <coordinateConversion><azimuthTime>2026-08-24T00:18:44.000000</azimuthTime>
          <sr0>8.0e+05</sr0><srgrCoefficients count="3">0 1.5 1e-7</srgrCoefficients></coordinateConversion>
      </coordinateConversionList></coordinateConversion>
      <geolocationGrid><geolocationGridPointList>
        <geolocationGridPoint><line>0</line><pixel>10</pixel><latitude>28.1</latitude>
          <longitude>85.3</longitude><height>1500</height></geolocationGridPoint>
      </geolocationGridPointList></geolocationGrid>
    </product>"""
    ann = P.parse_annotation(xml)
    assert ann.t_first_line == 4.5
    assert ann.orbit_t.tolist() == [0.0, 10.0]
    assert ann.orbit_pos[1].tolist() == [4, 5, 6]
    assert ann.srgr_coeffs[0].tolist() == [0, 1.5, 1e-7]
    assert (ann.n_lines, ann.n_samples) == (16000, 25000)
    assert ann.grid['height'].tolist() == [1500]


def test_make_grid_covers_bbox_in_utm():
    crs, xs, ys = P.make_grid((85.1, 27.9, 85.5, 28.3), res=10)
    assert crs == 'EPSG:32645'
    assert ys[0] > ys[-1] and xs[1] - xs[0] == 10
    assert 3500 < len(xs) < 4500 and 4000 < len(ys) < 5000


def _scene_over_nepal():
    # Circular orbit heading north along longitude 88 E, so the test area at
    # 85.3 E lies about 265 km to the west of the ground track.
    t = np.arange(0, 170, 10.0)
    u = np.radians(28.11) + OMEGA * (t - 80)
    lon = np.radians(88.0)
    pos = R_ORBIT * np.stack([np.cos(u) * np.cos(lon), np.cos(u) * np.sin(lon), np.sin(u)], -1)
    return _ann(orbit_t=t, orbit_pos=pos, line_interval=0.0015, n_lines=106000,
                n_samples=10 ** 6, srgr_sr0=np.array([700000.0]), srgr_coeffs=[np.array([0.0, 1.0])])


def test_geocode_flat_terrain_has_no_layover_or_shadow():
    crs, xs, ys = P.make_grid((85.30, 28.10, 85.32, 28.12), res=30)
    geo = P.geocode(_scene_over_nepal(), crs, xs, ys, np.zeros((len(ys), len(xs))))
    assert not geo['layover'].any() and not geo['shadow'].any()
    assert (geo['pixel'][:, 0] > geo['pixel'][:, -1]).all()    # range grows away from the sensor (west)
    assert (geo['line'][0] > geo['line'][-1]).all()            # northbound: north is imaged later
    assert 0.8 < geo['cos_lia'].min() and geo['cos_lia'].max() < 0.99
    assert geo['slope_deg'].max() == 0


def test_geocode_flags_layover_and_shadow_on_steep_slopes():
    crs, xs, ys = P.make_grid((85.30, 28.10, 85.32, 28.12), res=30)
    ann = _scene_over_nepal()
    ramp = np.tile(xs - xs[0], (len(ys), 1))
    # A slope facing the sensor (which is to the east) rises towards the west.
    facing_sensor = P.geocode(ann, crs, xs, ys, 6.0 * (ramp.max() - ramp))
    facing_away = P.geocode(ann, crs, xs, ys, 6.0 * ramp)
    assert facing_sensor['layover'][2:-2, 2:-2].all()
    assert not facing_sensor['shadow'].any()
    assert facing_away['shadow'][2:-2, 2:-2].all()
    assert not facing_away['layover'][2:-2, 2:-2].any()
