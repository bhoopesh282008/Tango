import io
import json
import sys
import tarfile
from pathlib import Path

import numpy as np
import pytest

sys.path.insert(0, str(Path(__file__).parent.parent))

import fetch_kurosiwo as K  # noqa: E402


def shard(samples=3, size=8):
    buf = io.BytesIO()
    with tarfile.open(fileobj=buf, mode='w', format=tarfile.USTAR_FORMAT) as t:
        for s in range(samples):
            for field in K.FIELDS:
                if field == 'info':
                    data, ext = json.dumps({'actid': 100 + s}).encode(), 'json'
                else:
                    a = np.full((1, size, size), 0.1 * (s + 1), 'float32')
                    if field == 'mask':
                        a[:] = s
                    if field == 'valid_mask':
                        a[:] = 1
                        a[0, 0, 0] = 0
                    b = io.BytesIO()
                    np.save(b, a)
                    data, ext = b.getvalue(), 'npy'
                info = tarfile.TarInfo(f'{s:06d}.{field}.{ext}')
                info.size = len(data)
                t.addfile(info, io.BytesIO(data))
    return buf.getvalue()


def test_a_slice_starting_mid_file_yields_only_complete_samples():
    raw = shard()
    assert sorted(K.samples_in(raw)) == ['000000', '000001', '000002']
    # Start inside the first sample: it is dropped, the rest are found.
    assert sorted(K.samples_in(raw[1024:])) == ['000001', '000002']
    # End inside the last sample: it is dropped too.
    one_sample = len(raw) // 3
    assert '000002' not in K.samples_in(raw[:len(raw) - one_sample])


def test_pack_converts_to_db_and_marks_invalid_pixels():
    packed = K.pack(K.samples_in(shard())['000002'])
    assert packed['x'].shape == (6, 8, 8) and packed['x'].dtype == np.float16
    assert abs(float(packed['x'][0, 1, 1]) - 10 * np.log10(0.3)) < 0.01
    assert packed['mask'][0, 0] == K.INVALID and packed['mask'][1, 1] == 2
    assert int(packed['actid']) == 102


def test_chunks_are_spread_over_every_shard_in_proportion():
    plan = K.plan_chunks([('a', 10 * K.CHUNK), ('b', 30 * K.CHUNK)], 4 * K.CHUNK)
    assert [p for p, _ in plan] == ['a', 'b', 'b', 'b']
    assert all(offset % 512 == 0 for _, offset in plan)
    offsets = [o for p, o in plan if p == 'b']
    assert offsets == sorted(offsets) and offsets[-1] + K.CHUNK <= 30 * K.CHUNK


def test_unet_shapes_and_event_split():
    torch = pytest.importorskip('torch')
    import train_model
    from unet import UNet, normalise

    out = UNet(base=8)(normalise(torch.full((2, 4, 224, 224), float('nan'))))
    assert out.shape == (2, 3, 224, 224) and torch.isfinite(out).all()

    actid = np.repeat(np.arange(20), 5)
    is_val, events = train_model.split_events(actid)
    assert len(events) == 3
    # No event is on both sides of the split.
    assert not set(actid[is_val]) & set(actid[~is_val])


def test_scores_from_a_known_confusion():
    torch = pytest.importorskip('torch')
    import train_model

    target = torch.tensor([0, 0, 2, 2, 2, 255])
    pred = torch.tensor([0, 2, 2, 2, 0, 2])
    s = train_model.scores(train_model.confusion(pred, target))
    assert s['iou'][2] == pytest.approx(2 / 4)       # 2 hits, 1 false alarm, 1 miss; invalid ignored
    assert s['precision'][2] == pytest.approx(2 / 3)
    assert s['recall'][2] == pytest.approx(2 / 3)


def test_full_raster_prediction_covers_every_pixel():
    torch = pytest.importorskip('torch')
    import predict
    from unet import UNet

    model, device = UNet(base=8).eval(), torch.device('cpu')
    raster = np.random.default_rng(0).normal(-12, 3, (300, 250)).astype('float32')
    raster[:10] = np.nan
    prob = predict.flood_probability(model, device, raster, raster, raster, raster)
    assert prob.shape == raster.shape and np.isfinite(prob).all()
    assert 0 <= prob.min() and prob.max() <= 1

    # NaN (layover / shadow) pixels are never classified, whatever the model says.
    classes, conf = predict.classify(np.ones_like(prob), raster, raster)
    assert (classes[:10] == 0).all() and (classes[10:] == 1).all()
    assert (conf[:10] == 0).all()
