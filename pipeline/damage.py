"""Which OSM features did the flood hit?"""
import geopandas as gpd


def flood_union(zones, include_uncertain=False):
    hit = zones if include_uncertain else zones[zones['type'].isin(['water', 'debris'])]
    return hit.geometry.union_all() if len(hit) else None


def flag_damaged(features, zones):
    """Add boolean `damaged` to a GeoDataFrame of buildings/roads/bridges."""
    features = features.copy()
    # Zones come on the raster's UTM grid, OSM features in degrees: compare them in one system.
    if len(zones) and zones.crs is not None and features.crs is not None and zones.crs != features.crs:
        zones = zones.to_crs(features.crs)
    union = flood_union(zones)
    features['damaged'] = False if union is None else features.geometry.intersects(union).to_numpy()
    return features


def flooded_length_km(roads, zones):
    """Length of each road segment that lies inside a water or debris zone, in km.

    `damaged` marks a whole segment that touches a zone; this is the part of it
    actually inside one, so a 5 km segment crossed once is not counted as 5 km.
    """
    union = flood_union(zones)
    if union is None or not len(roads):
        return [0.0] * len(roads)
    crs = roads.estimate_utm_crs()
    union = gpd.GeoSeries([union], crs=zones.crs).to_crs(crs).iloc[0]
    return (roads.geometry.to_crs(crs).intersection(union).length / 1000).round(3).tolist()


def assign_settlement(buildings, settlements):
    """Tag each building with the nearest settlement id."""
    crs = buildings.estimate_utm_crs()
    b = buildings[['geometry']].to_crs(crs)   # OSM tags can include columns named like ours
    s = settlements.to_crs(crs)[['id', 'geometry']].rename(columns={'id': 'settlement_id'})
    joined = gpd.sjoin_nearest(b, s, how='left')
    joined = joined[~joined.index.duplicated()]
    out = buildings.copy()
    out['settlement_id'] = joined['settlement_id'].reindex(out.index)
    return out
