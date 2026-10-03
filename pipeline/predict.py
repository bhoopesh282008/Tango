"""Run the trained U-Net over full before/after rasters."""
import numpy as np
import torch

import config as C
import segment
from unet import FLOOD, UNet, normalise

TILE = 224


def load_model(path, device=None):
    device = device or torch.device('cuda' if torch.cuda.is_available() else 'cpu')
    model = UNet().to(device)
    model.load_state_dict(torch.load(path, map_location=device)['state'])
    return model.eval(), device


@torch.no_grad()
def flood_probability(model, device, post_vv, post_vh, pre_vv, pre_vh, overlap=32, batch=16):
    """Per-pixel flood probability for rasters in dB. Tiles overlap and are averaged."""
    stack = np.stack([post_vv, post_vh, pre_vv, pre_vh]).astype('float32')
    _, h, w = stack.shape
    step = TILE - overlap
    rows = sorted({min(r, max(h - TILE, 0)) for r in range(0, max(h - overlap, 1), step)})
    cols = sorted({min(c, max(w - TILE, 0)) for c in range(0, max(w - overlap, 1), step)})
    padded = np.full((4, max(h, TILE), max(w, TILE)), np.nan, 'float32')
    padded[:, :h, :w] = stack
    total = np.zeros(padded.shape[1:], 'float32')
    count = np.zeros(padded.shape[1:], 'float32')
    corners = [(r, c) for r in rows for c in cols]
    for i in range(0, len(corners), batch):
        group = corners[i:i + batch]
        tiles = torch.from_numpy(np.stack([padded[:, r:r + TILE, c:c + TILE] for r, c in group])).to(device)
        with torch.autocast(device.type, enabled=device.type == 'cuda'):
            prob = model(normalise(tiles)).float().softmax(1)[:, FLOOD].cpu().numpy()
        for (r, c), p in zip(group, prob):
            total[r:r + TILE, c:c + TILE] += p
            count[r:r + TILE, c:c + TILE] += 1
    return (total / np.maximum(count, 1))[:h, :w]


def classify(probability, pre_db, post_db, slope_deg=None, flood_at=0.5, uncertain_at=0.3):
    """Model flood map combined with the baseline's debris rule.

    Kuro Siwo has no debris class, so water comes from the model and debris
    (a rise in backscatter) still comes from the thresholds in segment.py.
    Returns (classes, confidence) like segment.classify.
    """
    base_classes, base_conf = segment.classify(pre_db, post_db, slope_deg)
    valid = np.isfinite(pre_db) & np.isfinite(post_db)
    if slope_deg is not None:
        valid &= slope_deg < C.MAX_SLOPE_DEG
    water = valid & (probability >= flood_at)
    uncertain = valid & ~water & (probability >= uncertain_at)
    debris = (base_classes == C.CLASS_DEBRIS) & ~water

    classes = np.zeros(post_db.shape, 'uint8')
    conf = np.zeros(post_db.shape, 'float32')
    classes[uncertain], conf[uncertain] = C.CLASS_UNCERTAIN, 0.4
    classes[debris], conf[debris] = C.CLASS_DEBRIS, base_conf[debris]
    classes[water], conf[water] = C.CLASS_WATER, probability[water]
    return classes, conf
