"""Which OSM features did the flood hit?"""
import geopandas as gpd


def flood_union(zones, include_uncertain=False):
    hit = zones if include_uncertain else zones[zones['type'].isin(['water', 'debris'])]
    return hit.geometry.union_all() if len(hit) else None


def flag_damaged(features, zones):
    """Add boolean `damaged` to a GeoDataFrame of buildings/roads/bridges."""
    features = features.copy()
    union = flood_union(zones)
    features['damaged'] = False if union is None else features.geometry.intersects(union).to_numpy()
    return features


def assign_settlement(buildings, settlements):
    """Tag each building with the nearest settlement id."""
    crs = buildings.estimate_utm_crs()
    b = buildings.to_crs(crs)
    s = settlements.to_crs(crs)[['id', 'geometry']].rename(columns={'id': 'settlement_id'})
    joined = gpd.sjoin_nearest(b, s, how='left')
    joined = joined[~joined.index.duplicated()]
    out = buildings.copy()
    out['settlement_id'] = joined['settlement_id'].reindex(out.index)
    return out
