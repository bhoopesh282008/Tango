# Flood segmentation model

A small U-Net (`unet.py`, about 7.8 million weights) that labels each 10 m pixel of a Sentinel-1 before/after pair as no water, permanent water or flood. Input is four bands in dB: post VV, post VH, pre VV, pre VH.

## Data

Kuro Siwo (Bountos et al., NeurIPS 2024), labelled GRD patches from the Hugging Face WebDataset release, CC BY 4.0. The full labelled GRD set is 170 GB. `fetch_kurosiwo.py` downloads a 10.3 GB sample as chunks spread evenly over every shard, which gave 4,240 training and 1,170 test patches of 224 x 224 pixels.

## Training

`train_model.py`: 40 epochs, AdamW, one-cycle learning rate, class-weighted cross-entropy, flips and rotations, and a random choice between the two pre-flood scenes. Three whole flood events (709 patches) were held out for validation; the saved model is the epoch with the best validation flood IoU (epoch 11, 0.78). Validation IoU moved between 0.62 and 0.78 from epoch to epoch, so with only three validation events the choice of epoch is itself uncertain. About 50 seconds per epoch on an RTX 3050 (6 GB).

## Results on the test sample

Flood class, from `evaluate_model.py` (full output in `results/evaluation.json`). The baseline is the threshold rule in `segment.py` on the same patches.

| Test patches | Count | Model IoU | Model F1 | Baseline IoU | Baseline F1 |
|---|---|---|---|---|---|
| Events absent from training | 312 | 0.46 | 0.63 | 0.27 | 0.43 |
| Events also present in training | 858 | 0.69 | 0.82 | 0.45 | 0.62 |
| All | 1,170 | 0.67 | 0.80 | 0.44 | 0.61 |

Permanent water IoU is 0.37; the model often confuses permanent water with flood.

## What these numbers do and do not show

- **Most of the test sample is not unseen.** 11 of the 18 test activations also appear in the training sample (other areas of the same flood). The honest "never seen" figure is the first row: IoU 0.46 on 7 activations.
- **Results vary a lot by event.** Per-event flood IoU runs from 0.01 to 0.82; three of the seven unseen activations score about 0.20 or lower.
- **Almost none of the sample is mountainous.** Only 36 test patches have more than 300 m of relief, and all of them come from activations also present in training, so Kuro Siwo gives no evidence about steep, unseen terrain. The Trishuli comparison below is the only such test.
- **No debris class.** Kuro Siwo labels water only. In the pipeline (`predict.py`) water comes from the model and debris still comes from the threshold rule.
- **Preprocessing differs.** Kuro Siwo patches come from the dataset authors' processing chain; this pipeline uses its own calibration and terrain correction. The patch values are in the range of linear sigma0 backscatter, which is what this pipeline produces, but differences in filtering and geocoding may reduce accuracy on our rasters.
- **A sample, not the full dataset.** Training on all 47 GB of training patches would likely do better.

## On the real Trishuli scenes

On the 16 and 28 August 2026 scenes, which the model has never seen, it marks 0.53 km² of water on valley floors; the threshold rule marks 1.62 km², and 0.43 km² is common to both. The model fires where the surface became very dark (median -15 dB after the event), such as a large new dark patch at the Betrawati confluence, and finds nothing in the upper gorge near Rasuwagadhi. 
Compared with the Copernicus EMS reference for the event (EMSR927, used for checking only; `validate.py`), the model map is worse than the threshold map in all three reference areas inside the run:

| Area | Threshold map: IoU / precision / recall | Model map: IoU / precision / recall |
|---|---|---|
| 01 Syapru Besi | 0.035 / 0.88 / 0.035 | 0.019 / 0.97 / 0.019 |
| 02 Timure | 0.048 / 0.99 / 0.048 | 0.015 / 0.96 / 0.015 |
| 03 Bidur (63% inside the run) | 0.224 / 0.93 / 0.228 | 0.140 / 0.90 / 0.142 |

Of 2,538 reference buildings graded destroyed, damaged or possibly damaged, 201 (8%) lie in the model map's flood zones against 559 (22%) for the threshold map. The reference outlines a debris corridor, and the model has no debris class and was trained on open-water floods, so this is the result to expect; it is still a clear negative for using the model on this kind of event.

## Reproduce

```bash
python fetch_kurosiwo.py --train-gb 8 --test-gb 2
python train_model.py --epochs 40
python evaluate_model.py
python run.py --bbox W,S,E,N --event YYYY-MM-DD --model models/unet_kurosiwo.pt
```

The checkpoint (`models/unet_kurosiwo.pt`, 31 MB) is not in git.

## Citation

Bountos, N. I., Sdraka, M., Zavras, A., Karavias, A., Karasante, I., Herekakis, T., Thanasou, A., Michail, D., Papoutsis, I. (2024). Kuro Siwo: 33 billion m² under the water. A global multi-temporal satellite dataset for rapid flood mapping. Advances in Neural Information Processing Systems 37.
