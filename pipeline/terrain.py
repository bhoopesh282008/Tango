"""Where on the terrain a flood can be: height above the nearest drainage line.

A flood fills valley floors. Speckle and unrelated change are spread over the
whole scene, so restricting flood classes to ground within a few tens of
metres above the nearest river removes most false alarms without using any
reference map. Drainage lines come from pre-event OpenStreetMap waterways
where they are mapped, and from the DEM otherwise.
"""
import numpy as np
from rasterio import features
from scipy import ndimage

# A catchment this large (km2) makes a channel in the DEM-derived drainage.
MIN_CATCHMENT_KM2 = 2.0


def drainage_from_waterways(waterways, transform, shape, crs):
    """Rasterise waterway lines onto the grid. Empty mask if there are none."""
    if waterways is None or not len(waterways):
        return np.zeros(shape, bool)
    lines = waterways.to_crs(crs).geometry
    return features.rasterize([(g, 1) for g in lines if g is not None and not g.is_empty],
                              out_shape=shape, transform=transform, all_touched=True).astype(bool)


def drainage_from_dem(height, cell_m, factor=3):
    """Channels from the DEM: cells whose upstream area exceeds MIN_CATCHMENT_KM2.

    Works on a grid `factor` times coarser. Each cell drains to its lowest
    neighbour; cells are visited from the highest down and pass their area on.
    Pits are not filled, so channels can break at them, which is acceptable
    for a mask of valley floors.
    """
    coarse = height[::factor, ::factor].astype('float64')
    rows, cols = coarse.shape
    padded = np.pad(coarse, 1, constant_values=np.inf)
    best = coarse.copy()
    receiver = np.arange(rows * cols).reshape(rows, cols)
    for dr in (-1, 0, 1):
        for dc in (-1, 0, 1):
            if dr or dc:
                neighbour = padded[1 + dr:1 + dr + rows, 1 + dc:1 + dc + cols]
                lower = neighbour < best
                best = np.where(lower, neighbour, best)
                index = (np.arange(rows)[:, None] + dr) * cols + (np.arange(cols)[None, :] + dc)
                receiver = np.where(lower, index, receiver)
    receiver = receiver.ravel().tolist()
    area = [1] * (rows * cols)
    for cell in np.argsort(-coarse, axis=None).tolist():
        down = receiver[cell]
        if down != cell:
            area[down] += area[cell]
    cells_needed = MIN_CATCHMENT_KM2 * 1e6 / (cell_m * factor) ** 2
    channels = (np.array(area).reshape(rows, cols) >= cells_needed)
    full = np.repeat(np.repeat(channels, factor, axis=0), factor, axis=1)[:height.shape[0], :height.shape[1]]
    out = np.zeros(height.shape, bool)
    out[:full.shape[0], :full.shape[1]] = full
    return out


def height_above_drainage(height, drainage, cell_m):
    """(hand, distance): height above, and distance to, the nearest drainage cell.

    Both are infinite where there is no drainage at all.
    """
    if not drainage.any():
        return np.full(height.shape, np.inf, 'float32'), np.full(height.shape, np.inf, 'float32')
    distance, (rows, cols) = ndimage.distance_transform_edt(~drainage, sampling=cell_m, return_indices=True)
    return (height - height[rows, cols]).astype('float32'), distance.astype('float32')


def valley_floor(height, cell_m, waterways=None, transform=None, crs=None, max_height_m=30.0, max_distance_m=600.0):
    """Mask of ground a flood could plausibly reach, and which drainage source was used."""
    drainage = drainage_from_waterways(waterways, transform, height.shape, crs) if transform is not None else None
    source = 'OpenStreetMap waterways'
    if drainage is None or not drainage.any():
        drainage, source = drainage_from_dem(height, cell_m), 'DEM-derived channels'
    hand, distance = height_above_drainage(height, drainage, cell_m)
    return (hand <= max_height_m) & (distance <= max_distance_m), source
