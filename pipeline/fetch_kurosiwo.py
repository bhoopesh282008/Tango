"""Download a spread-out sample of the Kuro Siwo flood dataset.

    python fetch_kurosiwo.py --train-gb 8 --test-gb 2

Kuro Siwo (Bountos et al., NeurIPS 2024, CC BY 4.0) is published as large tar
shards in which the patches of one flood event sit together. Instead of whole
shards, this reads fixed-size chunks at evenly spaced offsets across every
shard with HTTP range requests, so every event is represented, and keeps the
patches that fall completely inside a chunk.

Each kept patch is stored as one .npz: x (6 bands in dB, float16: post VV, post
VH, pre1 VV, pre1 VH, pre2 VV, pre2 VH), mask (0 no water, 1 permanent water,
2 flood, 255 invalid), dem, and the event id.
"""
import argparse
import io
import json
from concurrent.futures import ThreadPoolExecutor
from pathlib import Path

import numpy as np
import requests

import config as C

REPO = 'orion-ai-lab/Kuro-Siwo-Webdataset'
API = f'https://huggingface.co/api/datasets/{REPO}/tree/main'
RESOLVE = f'https://huggingface.co/datasets/{REPO}/resolve/main'
SPLITS = {'train': 'train_GRD', 'test': 'test_GRD'}
BANDS = ['flood_vv', 'flood_vh', 'sec1_vv', 'sec1_vh', 'sec2_vv', 'sec2_vh']
FIELDS = BANDS + ['dem', 'mask', 'valid_mask', 'info']
CHUNK = 48 * 1024 * 1024
ROOT = C.CACHE / 'kurosiwo'
INVALID = 255


def list_shards(folder):
    response = requests.get(f'{API}/{folder}', timeout=60)
    response.raise_for_status()
    return sorted((f['path'], f['size']) for f in response.json() if f['path'].endswith('.tar'))


def plan_chunks(shards, budget_bytes, chunk=CHUNK):
    """(path, offset) pairs: chunks spread evenly over all shards, by size."""
    total = sum(size for _, size in shards)
    plan = []
    for path, size in shards:
        n = max(1, round(budget_bytes / chunk * size / total))
        for i in range(n):
            offset = int((i + 0.5) * size / n - chunk / 2)
            offset = max(0, min(offset, size - chunk)) // 512 * 512
            plan.append((path, offset))
    return plan


def _is_header(block):
    """A 512-byte block that is a valid tar header (magic and checksum agree)."""
    if len(block) < 512 or block[257:262] != b'ustar':
        return False
    try:
        stored = int(block[148:156].strip(b' \0') or b'0', 8)
    except ValueError:
        return False
    return stored == sum(block[:148]) + 8 * 32 + sum(block[156:512])


def tar_members(buffer):
    """(name, bytes) for every regular file wholly inside an arbitrary slice of a tar."""
    pos = 0
    while pos + 512 <= len(buffer) and not _is_header(buffer[pos:pos + 512]):
        pos += 512
    while pos + 512 <= len(buffer):
        header = buffer[pos:pos + 512]
        if not _is_header(header):
            break
        name = header[:100].split(b'\0', 1)[0].decode('utf-8', 'replace')
        prefix = header[345:500].split(b'\0', 1)[0].decode('utf-8', 'replace')
        size = int(header[124:136].strip(b' \0') or b'0', 8)
        start, end = pos + 512, pos + 512 + size
        if end > len(buffer):
            break
        if header[156:157] in (b'0', b'\0'):
            yield (f'{prefix}/{name}' if prefix else name), buffer[start:end]
        pos = start + (size + 511) // 512 * 512


def samples_in(buffer):
    """Complete samples in a tar slice: {key: {field: bytes}}."""
    groups = {}
    for name, data in tar_members(buffer):
        base = name.rsplit('/', 1)[-1]
        key, _, field = base.partition('.')
        groups.setdefault(key, {})[field.rsplit('.', 1)[0]] = data
    return {k: v for k, v in groups.items() if all(f in v for f in FIELDS)}


def to_db(power):
    return (10 * np.log10(np.clip(power, 1e-5, 10))).astype('float16')


def pack(fields):
    """Raw sample files -> arrays ready to save."""
    load = lambda f: np.load(io.BytesIO(fields[f]))[0]
    info = json.loads(fields['info'])
    mask = load('mask').astype('uint8')
    # 3 is the label layer's own no-data value; it and the invalid pixels are ignored in training.
    mask[(load('valid_mask') < 0.5) | (mask > 2)] = INVALID
    return {
        'x': np.stack([to_db(load(b)) for b in BANDS]),
        'mask': mask,
        'dem': load('dem').astype('float32'),
        'actid': np.int64(info['actid']),
    }


def fetch_chunk(split, path, offset):
    out = ROOT / split
    done = out / f"{path.rsplit('/', 1)[-1]}.{offset}.done"
    if done.exists():
        return 0
    for attempt in range(4):
        try:
            r = requests.get(f'{RESOLVE}/{path}', timeout=300,
                             headers={'Range': f'bytes={offset}-{offset + CHUNK - 1}'})
            r.raise_for_status()
            break
        except requests.RequestException:
            if attempt == 3:
                raise
    kept = 0
    # Sample keys are counters that restart in every shard, so the shard is part of the name.
    shard = path.rsplit('/', 1)[-1].removesuffix('.tar')
    for key, fields in samples_in(r.content).items():
        np.savez_compressed(out / f'{shard}_{key}.npz', **pack(fields))
        kept += 1
    done.write_text(str(kept))
    return kept


def download(split, budget_gb, workers=4):
    (ROOT / split).mkdir(parents=True, exist_ok=True)
    plan = plan_chunks(list_shards(SPLITS[split]), budget_gb * 1e9)
    print(f'{split}: {len(plan)} chunks, {len(plan) * CHUNK / 1e9:.1f} GB', flush=True)
    kept = 0
    with ThreadPoolExecutor(workers) as pool:
        for i, n in enumerate(pool.map(lambda job: fetch_chunk(split, *job), plan), 1):
            kept += n
            if i % 10 == 0 or i == len(plan):
                print(f'  {split} {i}/{len(plan)} chunks, {kept} new patches', flush=True)
    return len(list((ROOT / split).glob('*.npz')))


if __name__ == '__main__':
    ap = argparse.ArgumentParser()
    ap.add_argument('--train-gb', type=float, default=8)
    ap.add_argument('--test-gb', type=float, default=2)
    args = ap.parse_args()
    for split, gb in (('test', args.test_gb), ('train', args.train_gb)):
        print(split, 'patches on disk:', download(split, gb), flush=True)
