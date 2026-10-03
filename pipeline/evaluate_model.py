"""Score the trained U-Net on Kuro Siwo test events it never saw in training.

    python evaluate_model.py

Reports flood detection (IoU, precision, recall, F1) for the model and for the
threshold baseline in segment.py on the same patches, overall and for patches
in steep terrain. Writes models/evaluation.json.
"""
import json

import numpy as np
import torch

import config as C
import fetch_kurosiwo as K
import segment
from train_model import MODEL_PATH, confusion, load_split, predict_batches, scores
from unet import CLASS_NAMES, FLOOD, INVALID, UNet

# A 2.24 km patch with more relief than this is counted as steep terrain.
STEEP_RELIEF_M = 300


def binary_scores(pred_flood, truth, valid):
    tp = int((pred_flood & truth & valid).sum())
    fp = int((pred_flood & ~truth & valid).sum())
    fn = int((~pred_flood & truth & valid).sum())
    div = lambda a, b: round(a / b, 4) if b else None
    return {'iou': div(tp, tp + fp + fn), 'precision': div(tp, tp + fp),
            'recall': div(tp, tp + fn), 'f1': div(2 * tp, 2 * tp + fp + fn)}


def baseline_flood(x):
    """The change-detection baseline's water class on stored patches (VV, nearest pre scene)."""
    out = np.empty((len(x), 224, 224), bool)
    for i in range(len(x)):
        classes, _ = segment.classify(x[i, 2].astype('float32'), x[i, 0].astype('float32'))
        out[i] = classes == C.CLASS_WATER
    return out


def training_events():
    """Activation ids present in the training sample (train and validation patches)."""
    events = set()
    for f in (K.ROOT / 'train').glob('*.npz'):
        with np.load(f) as d:
            events.add(int(d['actid']))
    return events


def main():
    device = torch.device('cuda' if torch.cuda.is_available() else 'cpu')
    checkpoint = torch.load(MODEL_PATH, map_location=device)
    model = UNet().to(device)
    model.load_state_dict(checkpoint['state'])

    x, mask, relief, actid = load_split('test')
    pred = predict_batches(model, x, device).numpy()
    truth, valid = mask == FLOOD, mask != INVALID
    base = baseline_flood(x)

    multi = scores(confusion(torch.from_numpy(pred), torch.from_numpy(mask).long()))
    report = {
        'test_patches': int(len(x)), 'test_events': sorted(int(a) for a in np.unique(actid)),
        'trained_epoch': checkpoint['epoch'], 'train_patches': checkpoint['train_patches'],
        'flood_pixel_share': round(float(truth[valid].mean()), 4),
        'model_per_class_iou': dict(zip(CLASS_NAMES, (round(v, 4) for v in multi['iou']))),
        'flood': {},
    }
    # Kuro Siwo's test split shares activations with its training split (other areas of
    # the same flood), so "unseen" here means the activation is absent from training.
    seen = training_events()
    unseen = ~np.isin(actid, sorted(seen))
    report['test_events_also_in_training'] = sorted(int(a) for a in np.unique(actid[~unseen]))
    subsets = {'all': np.ones(len(x), bool), 'unseen_events': unseen, 'seen_events': ~unseen,
               'steep': relief > STEEP_RELIEF_M, 'steep_unseen': (relief > STEEP_RELIEF_M) & unseen,
               'flat': relief <= STEEP_RELIEF_M}
    for name, keep in subsets.items():
        report['flood'][name] = {
            'patches': int(keep.sum()),
            'model': binary_scores(pred[keep] == FLOOD, truth[keep], valid[keep]),
            'threshold_baseline': binary_scores(base[keep], truth[keep], valid[keep]),
        }
    # Per-event flood IoU shows how uneven the result is across events.
    report['flood_iou_by_event'] = {
        int(a): {'patches': int((actid == a).sum()),
                 'model': binary_scores(pred[actid == a] == FLOOD, truth[actid == a], valid[actid == a])['iou'],
                 'threshold_baseline': binary_scores(base[actid == a], truth[actid == a], valid[actid == a])['iou']}
        for a in np.unique(actid)
    }
    (MODEL_PATH.parent / 'evaluation.json').write_text(json.dumps(report, indent=1))
    print(json.dumps(report, indent=1))


if __name__ == '__main__':
    main()
