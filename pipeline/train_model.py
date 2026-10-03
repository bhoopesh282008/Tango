"""Train the flood segmentation U-Net on the Kuro Siwo sample.

    python train_model.py --epochs 40

Validation uses flood events held out from training (split by event, not by
patch, since neighbouring patches of one event look alike). The best epoch by
validation flood IoU is saved to models/unet_kurosiwo.pt.
"""
import argparse
import json
import time
from pathlib import Path

import numpy as np
import torch
from torch import nn

import config as C
import fetch_kurosiwo as K
from unet import FLOOD, INVALID, UNet, normalise

MODEL_PATH = C.ROOT / 'models' / 'unet_kurosiwo.pt'
VAL_FRACTION = 0.15


def load_split(split, limit=None):
    """All patches of a split in memory: x (N,6,H,W) float16 dB, mask, dem relief, event id."""
    files = sorted((K.ROOT / split).glob('*.npz'))[:limit]
    if not files:
        raise RuntimeError(f'No Kuro Siwo patches in {K.ROOT / split}; run fetch_kurosiwo.py first')
    x = np.empty((len(files), 6, 224, 224), 'float16')
    mask = np.empty((len(files), 224, 224), 'uint8')
    relief = np.empty(len(files), 'float32')
    actid = np.empty(len(files), 'int64')
    for i, f in enumerate(files):
        with np.load(f) as d:
            x[i], mask[i], actid[i] = d['x'], d['mask'], d['actid']
            dem = d['dem']
            relief[i] = np.nanmax(dem) - np.nanmin(dem) if np.isfinite(dem).any() else 0
    mask[mask > 2] = INVALID   # label no-data (3) in patches saved before pack() masked it
    return x, mask, relief, actid


def split_events(actid, fraction=VAL_FRACTION, seed=0):
    """Boolean mask of validation patches: whole events, about `fraction` of them."""
    events = np.unique(actid)
    rng = np.random.default_rng(seed)
    val_events = rng.choice(events, max(1, round(len(events) * fraction)), replace=False)
    return np.isin(actid, val_events), val_events


def batch_inputs(x, pre):
    """Network input from stored bands: post VV, post VH and one of the two pre scenes."""
    post = x[:, 0:2]
    before = np.where(pre[:, None, None, None] == 0, x[:, 2:4], x[:, 4:6])
    return np.concatenate([post, before], axis=1)


def augment(inputs, mask, rng):
    k = int(rng.integers(4))
    inputs, mask = np.rot90(inputs, k, (2, 3)), np.rot90(mask, k, (1, 2))
    if rng.random() < 0.5:
        inputs, mask = inputs[..., ::-1], mask[..., ::-1]
    return np.ascontiguousarray(inputs), np.ascontiguousarray(mask)


def confusion(pred, target, classes=3):
    valid = target != INVALID
    return torch.bincount(target[valid] * classes + pred[valid], minlength=classes * classes).reshape(classes, classes)


def scores(matrix):
    """Per-class IoU, precision, recall and F1 from a confusion matrix (rows = truth)."""
    matrix = matrix.double()
    tp = matrix.diag()
    fp, fn = matrix.sum(0) - tp, matrix.sum(1) - tp
    safe = lambda a, b: (a / b.clamp(min=1)).tolist()
    return {'iou': safe(tp, tp + fp + fn), 'precision': safe(tp, tp + fp),
            'recall': safe(tp, tp + fn), 'f1': safe(2 * tp, 2 * tp + fp + fn)}


@torch.no_grad()
def predict_batches(model, x, device, batch=64):
    """Predicted class per pixel for stored patches, always with the nearest pre scene."""
    model.eval()
    out = []
    for i in range(0, len(x), batch):
        inputs = torch.from_numpy(batch_inputs(x[i:i + batch], np.zeros(len(x[i:i + batch]), int)).astype('float32'))
        with torch.autocast(device.type, enabled=device.type == 'cuda'):
            out.append(model(normalise(inputs.to(device))).argmax(1).cpu())
    return torch.cat(out)


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument('--epochs', type=int, default=40)
    ap.add_argument('--batch', type=int, default=32)
    ap.add_argument('--lr', type=float, default=1e-3)
    ap.add_argument('--limit', type=int, help='use only the first N patches (smoke test)')
    args = ap.parse_args()

    device = torch.device('cuda' if torch.cuda.is_available() else 'cpu')
    x, mask, _, actid = load_split('train', args.limit)
    is_val, val_events = split_events(actid)
    train_idx, val_idx = np.flatnonzero(~is_val), np.flatnonzero(is_val)
    print(f'{len(train_idx)} train / {len(val_idx)} val patches, '
          f'{len(np.unique(actid[train_idx]))} / {len(val_events)} events, device {device}', flush=True)

    # Flood and permanent water are a few percent of pixels; weight classes by inverse sqrt frequency.
    counts = np.bincount(mask[train_idx].ravel(), minlength=256)[:3].astype('float64')
    weights = torch.tensor((counts.sum() / np.maximum(counts, 1)) ** 0.5, dtype=torch.float32)
    weights = (weights / weights.mean()).to(device)

    model = UNet().to(device)
    optimiser = torch.optim.AdamW(model.parameters(), lr=args.lr, weight_decay=1e-4)
    steps = args.epochs * (len(train_idx) // args.batch)
    schedule = torch.optim.lr_scheduler.OneCycleLR(optimiser, max_lr=args.lr, total_steps=steps)
    loss_fn = nn.CrossEntropyLoss(weight=weights, ignore_index=INVALID)
    scaler = torch.amp.GradScaler(enabled=device.type == 'cuda')
    rng = np.random.default_rng(0)

    best, history = -1.0, []
    MODEL_PATH.parent.mkdir(exist_ok=True)
    for epoch in range(1, args.epochs + 1):
        model.train()
        started, total = time.time(), 0.0
        order = rng.permutation(train_idx)
        for b in range(0, len(order) - args.batch + 1, args.batch):
            idx = np.sort(order[b:b + args.batch])
            inputs, target = augment(batch_inputs(x[idx], rng.integers(2, size=len(idx))), mask[idx], rng)
            inputs = normalise(torch.from_numpy(inputs.astype('float32')).to(device))
            target = torch.from_numpy(target).long().to(device)
            with torch.autocast(device.type, enabled=device.type == 'cuda'):
                loss = loss_fn(model(inputs), target)
            optimiser.zero_grad(set_to_none=True)
            scaler.scale(loss).backward()
            scaler.step(optimiser)
            scaler.update()
            schedule.step()
            total += loss.item()

        pred = predict_batches(model, x[val_idx], device)
        val = scores(confusion(pred, torch.from_numpy(mask[val_idx]).long()))
        row = {'epoch': epoch, 'loss': round(total / max(1, len(order) // args.batch), 4),
               'val_flood_iou': round(val['iou'][FLOOD], 4), 'val_iou': [round(v, 4) for v in val['iou']],
               'seconds': round(time.time() - started, 1)}
        history.append(row)
        print(json.dumps(row), flush=True)
        if val['iou'][FLOOD] > best:
            best = val['iou'][FLOOD]
            torch.save({'state': model.state_dict(), 'epoch': epoch, 'val': val,
                        'val_events': val_events.tolist(), 'train_patches': len(train_idx)}, MODEL_PATH)
    (MODEL_PATH.parent / 'training_log.json').write_text(json.dumps(history, indent=1))
    print('best validation flood IoU', round(best, 4), '->', MODEL_PATH)


if __name__ == '__main__':
    main()
