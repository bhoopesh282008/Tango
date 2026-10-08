import numpy as np
import pytest

import config as C
import segment

SHAPE = (24, 24)


def blocks(left, right):
    """A 24 x 24 image whose left half is `left` and right half `right` (so a median filter keeps each)."""
    image = np.empty(SHAPE, dtype='float32')
    image[:, :12], image[:, 12:] = left, right
    return image


def test_the_baseline_is_the_median_and_its_spread_is_how_much_each_pixel_varied():
    steady = [-10.0, -10.1, -9.9]
    unsteady = [-10.0, -16.0, -4.0]
    stack = np.stack([blocks(a, b) for a, b in zip(steady, unsteady)])
    median, spread = segment.temporal_baseline(stack)
    assert float(median[0, 0]) == pytest.approx(-10.0) and float(median[0, 20]) == pytest.approx(-10.0)
    assert float(spread[0, 0]) < 0.3
    assert float(spread[0, 20]) == pytest.approx(1.4826 * 6.0, rel=0.01)       # MAD of (0, 6, 6) is 6


def test_a_baseline_needs_three_images_and_ignores_missing_pixels():
    with pytest.raises(ValueError, match='at least three'):
        segment.temporal_baseline(np.zeros((2, 4, 4)))
    stack = np.stack([blocks(-10.0, -10.0), blocks(-10.2, -10.2), blocks(-9.8, -9.8)])
    stack[0, :, :4] = np.nan                         # one image has a gap
    median, spread = segment.temporal_baseline(stack)
    assert np.isfinite(median).all() and np.isfinite(spread).all()


def run(spread, drop_db):
    """Water/debris classes for a block that changes by drop_db (left) and one that does not (right)."""
    pre = blocks(-10.0, -10.0)
    post = blocks(-10.0 + drop_db, -10.0)
    floor = np.ones(SHAPE, bool)
    classes, _ = segment.classify_on_floor(pre, post, floor, spread)
    return classes[12, 3]


def test_steady_ground_flags_a_change_over_3_db_and_variable_ground_needs_more():
    steady = np.full(SHAPE, 0.2, 'float32')           # 3 x 0.2 = 0.6 dB: the fixed 3 dB is the larger
    variable = np.full(SHAPE, 2.0, 'float32')         # 3 x 2.0 = 6 dB must be exceeded
    assert run(steady, -3.5) == C.CLASS_WATER
    assert run(variable, -3.5) == C.CLASS_NONE        # an ordinary swing there
    assert run(variable, -7.0) == C.CLASS_WATER       # beyond it
    assert run(variable, +7.0) == C.CLASS_DEBRIS
    assert run(variable, +3.5) == C.CLASS_NONE


def test_the_threshold_never_falls_below_the_fixed_one():
    none = np.zeros(SHAPE, 'float32')
    assert run(none, -2.5) == C.CLASS_NONE
    assert run(none, -3.5) == C.CLASS_WATER
    assert run(none, +2.5) == C.CLASS_NONE


def test_without_a_baseline_the_rule_is_exactly_what_it_was():
    rng = np.random.default_rng(1)
    pre = rng.normal(-10, 3, SHAPE).astype('float32')
    post = pre + rng.normal(0, 4, SHAPE).astype('float32')
    floor = np.ones(SHAPE, bool)
    a = segment.classify(pre, post, None, floor)
    b = segment.classify(pre, post, None, floor, spread=None)
    c = segment.classify_on_floor(pre, post, floor)
    for x, y in ((a, b), (a, c)):
        assert np.array_equal(x[0], y[0]) and np.array_equal(x[1], y[1])


def test_a_baseline_can_only_remove_detections_never_add_them():
    rng = np.random.default_rng(2)
    pre = rng.normal(-10, 3, (48, 48)).astype('float32')
    post = pre + rng.normal(0, 4, (48, 48)).astype('float32')
    floor = np.ones((48, 48), bool)
    spread = np.abs(rng.normal(0, 1.5, (48, 48))).astype('float32')
    plain, _ = segment.classify(pre, post, None, floor)
    aware, _ = segment.classify(pre, post, None, floor, spread=spread)
    assert ((aware == C.CLASS_WATER) & (plain != C.CLASS_WATER)).sum() == 0
    assert ((aware == C.CLASS_DEBRIS) & (plain != C.CLASS_DEBRIS)).sum() == 0
    assert (aware == C.CLASS_WATER).sum() < (plain == C.CLASS_WATER).sum()


@pytest.mark.parametrize('extra, message', [
    (['--baseline-images', '2'], 'two images give no spread'),
    (['--baseline-images', '0'], 'two images give no spread'),
    (['--baseline-images', '3', '--pre', 'a.tif', '--post', 'b.tif'], 'cannot be combined'),
    (['--baseline-images', '3', '--model', 'm.pt'], 'cannot be combined'),
])
def test_the_baseline_option_refuses_what_cannot_work(monkeypatch, capsys, extra, message):
    import run
    monkeypatch.setattr('sys.argv', ['run.py', '--bbox', '85.1,27.9,85.3,28.1', '--event', '2026-08-26', *extra])
    with pytest.raises(SystemExit) as stop:
        run.main()
    assert stop.value.code == 2
    assert message in capsys.readouterr().err
