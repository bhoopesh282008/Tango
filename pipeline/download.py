"""Access to one Sentinel-1 GRD scene on the Copernicus Data Space.

Preferred: S3 keys (AWS_ACCESS_KEY_ID / AWS_SECRET_ACCESS_KEY from the CDSE
dashboard), which let GDAL read only the window of the image we need.
Fallback: CDSE_USER / CDSE_PASSWORD, which downloads the whole product zip.
Credentials are read from the environment and never written anywhere.
"""
import os
import zipfile
from dataclasses import dataclass, field

import rasterio
import requests
from rasterio.windows import Window

import config as C

S3_ENDPOINT = 'eodata.dataspace.copernicus.eu'
TOKEN_URL = 'https://identity.dataspace.copernicus.eu/auth/realms/CDSE/protocol/openid-connect/token'


@dataclass
class Scene:
    id: str
    raster: str                 # path rasterio can open
    product_xml: str
    calibration_xml: str
    noise_xml: str
    env: dict = field(default_factory=dict)


def _have_s3_keys():
    return bool(os.environ.get('AWS_ACCESS_KEY_ID') and os.environ.get('AWS_SECRET_ACCESS_KEY'))


def s3_env():
    """GDAL settings for reading Copernicus Data Space objects; needs the S3 keys.

    Reading a scene is thousands of small range requests over many minutes, so a few of them
    failing on the way is normal. GDAL is told to repeat a failed request (with a pause) and to
    give up on one that stalls, instead of ending the whole run at the first hiccup.
    """
    if not _have_s3_keys():
        raise RuntimeError('This step needs the Copernicus Data Space S3 keys '
                           '(AWS_ACCESS_KEY_ID and AWS_SECRET_ACCESS_KEY).')
    return {
        'AWS_S3_ENDPOINT': S3_ENDPOINT, 'AWS_VIRTUAL_HOSTING': 'FALSE', 'AWS_HTTPS': 'YES',
        'GDAL_HTTP_MAX_RETRY': '6', 'GDAL_HTTP_RETRY_DELAY': '2',
        'GDAL_HTTP_CONNECTTIMEOUT': '20', 'GDAL_HTTP_TIMEOUT': '90',
    }


def vsis3(href):
    """s3://bucket/key -> the path GDAL opens."""
    return '/vsis3/' + href.removeprefix('s3://')


def _s3_text(client, href, cache):
    if not cache.exists():
        bucket, key = href.removeprefix('s3://').split('/', 1)
        cache.parent.mkdir(parents=True, exist_ok=True)
        cache.write_bytes(client.get_object(Bucket=bucket, Key=key)['Body'].read())
    return cache.read_text(encoding='utf-8')


def _scene_s3(item, pol):
    import boto3
    from botocore.config import Config

    # The scene's small XML files; the same repeat-and-give-up-on-a-stall rule as for the image itself.
    client = boto3.client('s3', endpoint_url=f'https://{S3_ENDPOINT}', region_name='default',
                          config=Config(retries={'max_attempts': 8, 'mode': 'standard'},
                                        connect_timeout=20, read_timeout=60))
    folder = C.CACHE / 's1' / item.id
    text = {
        kind: _s3_text(client, item.assets[f'schema-{kind}-{pol}'].href, folder / f'{kind}-{pol}.xml')
        for kind in ('product', 'calibration', 'noise')
    }
    return Scene(
        id=item.id,
        raster=vsis3(item.assets[pol].href),
        product_xml=text['product'], calibration_xml=text['calibration'], noise_xml=text['noise'],
        env=s3_env(),
    )


def _scene_zip(item, pol):
    folder = C.CACHE / 's1' / item.id
    archive = folder / 'product.zip'
    if not archive.exists():
        folder.mkdir(parents=True, exist_ok=True)
        token = requests.post(TOKEN_URL, timeout=60, data={
            'grant_type': 'password', 'client_id': 'cdse-public',
            'username': C.CDSE_USER, 'password': C.CDSE_PASSWORD,
        })
        token.raise_for_status()
        headers = {'Authorization': f"Bearer {token.json()['access_token']}"}
        partial = archive.with_suffix('.part')
        with requests.get(item.assets['Product'].href, headers=headers, stream=True, timeout=600) as r:
            r.raise_for_status()
            with open(partial, 'wb') as f:
                for chunk in r.iter_content(1 << 20):
                    f.write(chunk)
        partial.rename(archive)
    with zipfile.ZipFile(archive) as z:
        names = z.namelist()

        def find(part, prefix=''):
            return next(n for n in names
                        if part in n and f'-{pol}-' in n.rsplit('/', 1)[-1]
                        and n.rsplit('/', 1)[-1].startswith(prefix))

        tiff = find('/measurement/')
        if not (folder / tiff).exists():
            z.extract(tiff, folder)
        return Scene(
            id=item.id,
            raster=str(folder / tiff),
            product_xml=z.read(next(n for n in names if '/annotation/' in n and '/calibration/' not in n
                                    and f'-{pol}-' in n and n.endswith('.xml'))).decode('utf-8'),
            calibration_xml=z.read(find('/annotation/calibration/', 'calibration-')).decode('utf-8'),
            noise_xml=z.read(find('/annotation/calibration/', 'noise-')).decode('utf-8'),
        )


def get_scene(item, pol='vv'):
    if _have_s3_keys():
        return _scene_s3(item, pol)
    if C.CDSE_USER and C.CDSE_PASSWORD:
        return _scene_zip(item, pol)
    raise RuntimeError(
        'No Copernicus Data Space credentials found. Set AWS_ACCESS_KEY_ID and '
        'AWS_SECRET_ACCESS_KEY (CDSE S3 keys), or CDSE_USER and CDSE_PASSWORD.'
    )


def read_window(scene, window):
    """Digital numbers for (row0, row1, col0, col1) of the radar image."""
    r0, r1, c0, c1 = window
    with rasterio.Env(**scene.env), rasterio.open(scene.raster) as src:
        return src.read(1, window=Window(c0, r0, c1 - c0, r1 - r0))
