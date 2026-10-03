import sys
from pathlib import Path
from types import SimpleNamespace

import numpy as np
import rasterio

sys.path.insert(0, str(Path(__file__).parent.parent))

import config as C  # noqa: E402
import fetch_s2  # noqa: E402
import quicklook  # noqa: E402

SHAPE = (4, 4)
# Reflectances (green, red, nir, swir) of three kinds of ground.
FOREST = (0.05, 0.04, 0.40, 0.15)
WATER = (0.08, 0.06, 0.03, 0.02)
BARE = (0.15, 0.20, 0.25, 0.30)


def look(ground, clear=True):
    out = {name: np.full(SHAPE, value, 'float32') for name, value in zip(fetch_s2.BANDS, ground)}
    out['clear'] = np.full(SHAPE, clear)
    return out


def paint(base, rows, ground):
    for name, value in zip(fetch_s2.BANDS, ground):
        base[name][rows] = value
    return base


def test_reflectance_applies_the_offset_and_marks_no_data():
    dn = np.array([[0, 1000, 3000]], 'uint16')
    r = fetch_s2.reflectance(dn, '05.12')
    assert np.isnan(r[0, 0]) and r[0, 1] == 0 and np.isclose(r[0, 2], 0.2)
    assert np.isclose(fetch_s2.reflectance(dn, '03.01')[0, 2], 0.3)   # older products have no offset


def test_classify_finds_new_water_and_stripped_vegetation():
    before = look(FOREST)
    after = paint(paint(look(FOREST), 0, WATER), 1, BARE)
    after['clear'][3] = False                      # cloud over the last row
    classes, valid = fetch_s2.classify(before, after)
    assert (classes[0] == fetch_s2.OPTICAL_WATER).all()
    assert (classes[1] == fetch_s2.OPTICAL_DEBRIS).all()
    assert (classes[2] == fetch_s2.OPTICAL_NONE).all()
    assert not valid[3].any() and (classes[3] == 0).all()


def test_water_that_was_already_there_is_not_new():
    classes, _ = fetch_s2.classify(look(WATER), look(WATER))
    assert (classes == fetch_s2.OPTICAL_NONE).all()


def test_composite_takes_the_first_clear_look_per_pixel():
    cloudy = look(BARE)
    cloudy['clear'][:2] = False
    result = fetch_s2.composite([cloudy, look(FOREST)])
    assert result['clear'].all()
    assert np.isclose(result['nir'][0, 0], FOREST[2]) and np.isclose(result['nir'][3, 0], BARE[2])
    assert result['source'][0, 0] == 1 and result['source'][3, 0] == 0
    nothing = fetch_s2.composite([look(BARE, clear=False)])
    assert not nothing['clear'].any() and (nothing['source'] == -1).all()


def test_fuse_confirms_fills_blind_spots_and_never_removes():
    radar = np.zeros(SHAPE, 'uint8')
    conf = np.zeros(SHAPE, 'float32')
    radar[0], conf[0] = C.CLASS_WATER, 0.65        # radar water
    seen = np.ones(SHAPE, bool)
    seen[2] = False                                # radar blind (layover / steep)
    optical = np.zeros(SHAPE, 'uint8')
    optical[0, :2] = fetch_s2.OPTICAL_WATER        # agrees on half of row 0
    optical[1] = fetch_s2.OPTICAL_DEBRIS           # radar saw nothing here
    optical[2] = fetch_s2.OPTICAL_WATER            # in the blind spot
    valid = np.ones(SHAPE, bool)
    valid[3] = False

    classes, out_conf, counts = fetch_s2.fuse(radar, conf, seen, optical, valid)
    assert (classes[0] == C.CLASS_WATER).all()                       # radar water kept everywhere
    assert np.allclose(out_conf[0, :2], 0.9) and np.allclose(out_conf[0, 2:], 0.65)
    assert (classes[1] == C.CLASS_UNCERTAIN).all()                   # optical-only: a prompt to check
    assert (classes[2] == C.CLASS_WATER).all() and np.allclose(out_conf[2], 0.6)
    assert (classes[3] == C.CLASS_NONE).all()
    assert counts == {'confirmed': 2, 'filled_blind_spots': 4, 'optical_only': 4}
    assert (radar[1] == 0).all()                                     # inputs untouched


def test_acquisitions_group_tiles_and_drop_partial_passes():
    def tile(when, west, east):
        return SimpleNamespace(properties={'datetime': when}, geometry={
            'type': 'Polygon', 'coordinates': [[[west, 27], [east, 27], [east, 29], [west, 29], [west, 27]]]})
    bbox = '85.0,27.5,86.0,28.5'
    items = [tile('2026-08-12T04:57:00Z', 84.0, 85.6), tile('2026-08-12T04:57:10Z', 85.6, 87.0),
             tile('2026-08-11T04:52:00Z', 85.8, 87.0)]
    passes = fetch_s2.acquisitions(items, bbox)
    assert [(when[:10], len(tiles)) for when, tiles in passes] == [('2026-08-12', 2)]


def test_quicklooks_are_small_pngs_with_transparent_no_data(tmp_path):
    db = np.full((300, 200), -12.5, 'float32')
    db[:50] = np.nan
    db[250:] = -40
    assert quicklook.shrink(np.ones((4000, 3000))).shape == (1333, 1000)
    shape = quicklook.radar_png(db, tmp_path / 'r.png')
    with rasterio.open(tmp_path / 'r.png') as src:
        grey, alpha = src.read()
    assert shape == (300, 200) and grey.shape == (300, 200)
    assert (alpha[:50] == 0).all() and (alpha[50:] == 255).all()
    assert grey[100, 100] == 128 and grey[299, 0] == 1               # mid-grey, and clipped dark

    scene = look(FOREST)
    scene['clear'][0] = False
    quicklook.optical_png(scene, tmp_path / 'o.png')
    with rasterio.open(tmp_path / 'o.png') as src:
        rgba = src.read()
    assert rgba.shape == (4, 4, 4) and (rgba[3, 0] == 0).all() and (rgba[3, 1] == 255).all()
    assert rgba[0, 1, 1] == 255 and rgba[1, 1, 1] < 40               # near infrared saturates, red is dark
    assert not list(tmp_path.glob('*.aux.xml'))
