"""Compare a flood map with a reference (e.g. Copernicus EMS EMSR927).

The reference is for checking only; it must never feed the pipeline.
"""
import geopandas as gpd


def compare(zones, reference):
    """IoU, precision and recall of mapped flood area against a reference."""
    crs = zones.estimate_utm_crs()
    mapped = zones[zones['type'].isin(['water', 'debris'])].to_crs(crs).geometry.union_all()
    ref = reference.to_crs(crs).geometry.union_all()
    inter = mapped.intersection(ref).area
    union = mapped.union(ref).area
    return {
        'mapped_km2': round(mapped.area / 1e6, 3),
        'reference_km2': round(ref.area / 1e6, 3),
        'iou': round(inter / union, 3) if union else 0.0,
        'precision': round(inter / mapped.area, 3) if mapped.area else 0.0,
        'recall': round(inter / ref.area, 3) if ref.area else 0.0,
    }


def compare_files(zones_path, reference_path):
    return compare(gpd.read_file(zones_path), gpd.read_file(reference_path))
