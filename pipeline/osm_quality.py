"""How complete is the pre-event OpenStreetMap data here? Computed from that data alone.

"Cut off" can only be judged where the road map is there to judge it by. A settlement with no mapped
road is "access unknown", not "connected" and not "cut off". These figures tell a reader how much of
the answer rests on missing map data, so a sparse valley is not mistaken for a safe one.
"""
import geopandas as gpd

NEAR_ROAD_M = 300      # a building this close to a mapped road is "served" by the road map


def summarise(buildings, roads, status, near_m=NEAR_ROAD_M):
    """Plain figures for satellite.json.

    buildings, roads: GeoDataFrames (any CRS). status: {settlement id: True | False | None} from
    cutoff.connectivity, where None means the settlement has no route in the pre-event roads at all.
    """
    summary = {
        'buildings': int(len(buildings)),
        'buildings_near_road': None,
        'near_road_m': near_m,
        'road_km': None,
        'settlements': int(len(status)),
        'settlements_without_road': int(sum(1 for v in status.values() if v is None)),
    }
    if len(roads):
        metric = roads.to_crs(roads.estimate_utm_crs())
        summary['road_km'] = round(float(metric.length.sum()) / 1000, 1)
    if len(buildings) and len(roads):
        metric_roads = roads.to_crs(roads.estimate_utm_crs())[['geometry']]
        points = buildings.to_crs(metric_roads.crs)[['geometry']].copy()
        points['geometry'] = points.geometry.representative_point()
        near = gpd.sjoin_nearest(points, metric_roads, how='inner', max_distance=near_m)
        summary['buildings_near_road'] = round(near.index.nunique() / len(points), 3)
    elif len(buildings):
        summary['buildings_near_road'] = 0.0
    return summary
