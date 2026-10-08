import sys
from pathlib import Path

import pytest

sys.path.insert(0, str(Path(__file__).parent.parent))

import download  # noqa: E402


def test_scene_reads_are_told_to_repeat_failed_requests_and_not_to_wait_for_ever(monkeypatch):
    monkeypatch.setenv('AWS_ACCESS_KEY_ID', 'x')
    monkeypatch.setenv('AWS_SECRET_ACCESS_KEY', 'y')
    env = download.s3_env()
    assert int(env['GDAL_HTTP_MAX_RETRY']) >= 3
    assert float(env['GDAL_HTTP_RETRY_DELAY']) > 0
    assert 0 < float(env['GDAL_HTTP_TIMEOUT']) <= 120
    assert env['AWS_S3_ENDPOINT'] == download.S3_ENDPOINT


def test_without_keys_the_error_says_which_ones(monkeypatch):
    monkeypatch.delenv('AWS_ACCESS_KEY_ID', raising=False)
    monkeypatch.delenv('AWS_SECRET_ACCESS_KEY', raising=False)
    with pytest.raises(RuntimeError, match='AWS_ACCESS_KEY_ID and AWS_SECRET_ACCESS_KEY'):
        download.s3_env()


def test_the_s3_client_for_a_scene_retries(monkeypatch):
    """The client used for a scene's XML files is built with a retry policy and timeouts."""
    seen = {}

    class Client:
        def get_object(self, **kwargs):
            raise AssertionError('not reached')

    import boto3
    monkeypatch.setattr(boto3, 'client', lambda *a, **k: seen.update(k) or Client())
    monkeypatch.setenv('AWS_ACCESS_KEY_ID', 'x')
    monkeypatch.setenv('AWS_SECRET_ACCESS_KEY', 'y')
    monkeypatch.setattr(download.C, 'CACHE', Path('does-not-exist'))
    item = type('Item', (), {'id': 'S1', 'assets': {}})()
    with pytest.raises(KeyError):            # stops at the first asset lookup, after the client exists
        download._scene_s3(item, 'vv')
    config = seen['config']
    assert config.retries['max_attempts'] >= 5
    assert config.connect_timeout <= 30 and config.read_timeout <= 120


def test_a_window_read_that_is_cut_short_is_repeated_then_reported(monkeypatch):
    import numpy as np
    import rasterio

    class Source:
        def __init__(self, fails):
            self.fails = fails

        def __enter__(self):
            return self

        def __exit__(self, *args):
            return False

        def read(self, band, window=None):
            if self.fails.pop(0):
                raise rasterio.errors.RasterioIOError('TIFFReadEncodedTile() failed.' + chr(10) + 'more detail')
            return np.ones((2, 2))

    scene = download.Scene(id='x', raster='s3', product_xml='', calibration_xml='', noise_xml='')
    said = []

    plan = [True, True, False]       # fails twice, then reads
    monkeypatch.setattr(rasterio, 'open', lambda path: Source(plan))
    out = download.read_window(scene, (0, 2, 0, 2), pause=0, say=lambda *a, **k: said.append(a[0]))
    assert out.shape == (2, 2) and len(said) == 2 and 'trying again (3 of 4)' in said[1]

    always = [True] * 10
    monkeypatch.setattr(rasterio, 'open', lambda path: Source(always))
    with pytest.raises(RuntimeError, match='failed 4 times'):
        download.read_window(scene, (0, 2, 0, 2), pause=0, say=lambda *a, **k: None)
