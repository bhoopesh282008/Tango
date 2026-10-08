"""Add outlines.json to a run made before the viewer outlined the flood zones.

    python add_outlines.py out/trishuli
    python add_outlines.py out/trishuli --copy-to ../public/data/trishuli-corridor-rasuwa

`run.py` writes the file itself now. For an older run this works from what the run kept: its
radar rasters (the grid), its flood zones and its pictures. The close-up picture does not record
which part of the grid it shows, so that is found by looking for the picture's pixels in the
radar raster, and the result is used only when the whole 800 x 800 close-up matches exactly.

--copy-to puts the file in a published run's folder, and only if that folder holds the very
same flood zones as this run, so outlines are never attached to a different run's pictures.
"""
import argparse
import shutil
import sys
from pathlib import Path

import geopandas as gpd
import numpy as np
import rasterio
import rasterio.features

import quicklook

SEARCH = 150          # cells either way from the first guess


def read_grid(run_dir):
    with rasterio.open(Path(run_dir) / 'rasters' / 'pre_vv_db.tif') as src:
        return src.read(1).astype('float32'), src.transform, src.crs


def read_picture(path):
    with rasterio.open(path) as src:
        return src.read(1)


def first_guess(zones, transform, shape, side):
    """The densest window of the zones themselves: close to, but not exactly, the one the run chose
    (the run used every flood cell, before small zones were dropped)."""
    flood = zones[zones['type'].isin(['water', 'debris'])]
    if flood.empty:
        return 0, 0
    mask = rasterio.features.rasterize(flood.geometry, out_shape=shape, transform=transform, dtype='uint8').astype(bool)
    return quicklook.densest_window(mask, side)[:2]


def find_window(grey, picture, guess):
    """(row, col) where `picture` (uint8) is the cut of `grey` (the scaled radar raster), or None.

    The picture is the raster scaled and cut at full resolution, so it matches cell for cell.
    Looks near `guess`, with a small patch first and the whole picture to confirm.
    """
    rows, cols = picture.shape
    r0, c0 = rows // 2 - 20, cols // 2 - 20
    patch = picture[r0:r0 + 40, c0:c0 + 40]
    found = []
    for row in range(max(0, guess[0] - SEARCH), min(grey.shape[0] - rows, guess[0] + SEARCH) + 1):
        for col in range(max(0, guess[1] - SEARCH), min(grey.shape[1] - cols, guess[1] + SEARCH) + 1):
            if np.array_equal(grey[row + r0:row + r0 + 40, col + c0:col + c0 + 40], patch) \
                    and np.array_equal(grey[row:row + rows, col:col + cols], picture):
                found.append((row, col))
    return found[0] if len(found) == 1 else None


def add_outlines(run_dir):
    """Write outlines.json into run_dir. Returns the outlines written, or None when no zone shows."""
    run_dir = Path(run_dir)
    pre_db, transform, crs = read_grid(run_dir)
    zones = gpd.read_file(run_dir / 'flood_zones.geojson').to_crs(crs)

    (rows, cols), _ = quicklook.picture_size(pre_db.shape)
    whole = read_picture(run_dir / 'before.png')
    if whole.shape != (rows, cols):
        raise SystemExit(f'before.png is {whole.shape[1]} x {whole.shape[0]} but the grid shrinks to {cols} x {rows}: '
                         'these pictures are not from these rasters.')

    window = None
    if (run_dir / 'before_detail.png').exists():
        picture = read_picture(run_dir / 'before_detail.png')
        grey = quicklook.scale(pre_db, *quicklook.RADAR_RANGE_DB)
        guess = first_guess(zones, transform, pre_db.shape, picture.shape[0])
        found = find_window(grey, picture, guess)
        if found is None:
            raise SystemExit('Could not place the close-up picture in the radar raster, so it would be outlined in the '
                             'wrong place. Nothing was written.')
        window = (*found, *picture.shape)
        print(f'  Close-up is rows {found[0]}-{found[0] + picture.shape[0]}, columns {found[1]}-{found[1] + picture.shape[1]} '
              f'(matched cell for cell)')

    outlines = quicklook.zone_outlines(zones, transform, pre_db.shape, window)
    return outlines if quicklook.write_outlines(run_dir, outlines) else None


def main():
    parser = argparse.ArgumentParser(description=__doc__.split('\n')[0])
    parser.add_argument('run_dir')
    parser.add_argument('--copy-to', help="a published run's folder in public/data")
    args = parser.parse_args()
    run_dir = Path(args.run_dir)
    outlines = add_outlines(run_dir)
    if outlines is None:
        print('No flood zone shows in the pictures, so there is no outlines.json.')
        return
    size = (run_dir / 'outlines.json').stat().st_size
    print(f'Wrote {run_dir / "outlines.json"} ({size / 1024:.0f} KB): '
          + ', '.join(f'{view}: {", ".join(f"{k} {v.count("M")}" for k, v in data["paths"].items())}'
                      for view, data in outlines.items() if data))
    if args.copy_to:
        target = Path(args.copy_to)
        if not (target / 'flood_zones.geojson').exists() or \
                (target / 'flood_zones.geojson').read_bytes() != (run_dir / 'flood_zones.geojson').read_bytes():
            sys.exit(f'{target} does not hold this run\'s flood zones, so the outlines were not copied.')
        shutil.copy2(run_dir / 'outlines.json', target / 'outlines.json')
        print(f'Copied to {target}')


if __name__ == '__main__':
    main()
