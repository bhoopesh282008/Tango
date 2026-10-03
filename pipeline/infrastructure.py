"""Bridges and health facilities for the dashboard's infrastructure layer.

A bridge is flagged when it lies inside a mapped water or debris zone; a health
facility when the road network no longer connects it to the rest. Both are
inferences from an overlap, not inspections. Power lines are left out: a line
spanning a flooded river is no evidence that it is down.
"""
import geopandas as gpd
import networkx as nx

import cutoff
import damage

HEALTH_TYPE = 'health_post'


def _points(features):
    """Representative point per feature (lines and polygons included)."""
    out = features.copy()
    out['geometry'] = out.geometry.representative_point()
    return out


def _nearest_settlement(points, settlements):
    if not len(points) or not len(settlements):
        return [None] * len(points)
    crs = points.estimate_utm_crs()
    # Only geometry on the left: OSM tags can include columns named like ours.
    left = points[['geometry']].to_crs(crs)
    right = settlements.to_crs(crs)[['id', 'geometry']].rename(columns={'id': 'settlement_id'})
    joined = gpd.sjoin_nearest(left, right, how='left')
    joined = joined[~joined.index.duplicated()]
    return joined['settlement_id'].reindex(points.index).tolist()


def _names(row, fallback):
    """(display name, Nepali name); see run.names for the tag convention."""
    local = row.get('name') if isinstance(row.get('name'), str) and row.get('name') else None
    english = row.get('name:en') if isinstance(row.get('name:en'), str) and row.get('name:en') else None
    nepali = row.get('name:ne') if isinstance(row.get('name:ne'), str) and row.get('name:ne') else None
    devanagari = bool(local) and any('ऀ' <= ch <= 'ॿ' for ch in local)
    return english or local or fallback, nepali or (local if devanagari else None)


def build(bridges, health, roads, zones, settlements, snap_m=500):
    """List of {id, settlement_id, type, name, name_np, lat, lng, status}.

    roads must already carry the `damaged` flag from damage.flag_damaged.
    """
    items = []

    if len(bridges):
        flagged = damage.flag_damaged(bridges, zones)
        pts = _points(flagged).to_crs('EPSG:4326')
        near = _nearest_settlement(pts, settlements)
        for i, (_, b) in enumerate(pts.iterrows()):
            name, name_np = _names(b, 'Unnamed bridge')
            items.append({
                'id': f'b{i + 1:03d}', 'settlement_id': near[i], 'type': 'bridge',
                'name': name, 'name_np': name_np,
                'lat': b.geometry.y, 'lng': b.geometry.x,
                'status': 'destroyed' if b['damaged'] else 'operational',
            })

    if len(health):
        crs = roads.estimate_utm_crs()
        metric_roads = roads.to_crs(crs)
        before = cutoff.build_graph(metric_roads, include_damaged=True)
        after = cutoff.build_graph(metric_roads, include_damaged=False)
        # The main network is the largest connected piece of the pre-event roads.
        main = max(nx.connected_components(before), key=len) if len(before) else set()
        still_main = max(nx.connected_components(after), key=len) if len(after) else set()
        snap_before, snap_after = cutoff.snapper(before), cutoff.snapper(after)

        pts = _points(health)
        metric = pts.to_crs(crs)
        geo = pts.to_crs('EPSG:4326')
        near = _nearest_settlement(pts, settlements)
        for i, ((_, h), m) in enumerate(zip(geo.iterrows(), metric.geometry)):
            node = snap_before(m, snap_m)
            if node is None or node not in main:
                continue  # not on the mapped road network before the event: cannot be assessed
            status = 'operational' if snap_after(m, snap_m) in still_main else 'unreachable'
            name, name_np = _names(h, 'Unnamed health facility')
            items.append({
                'id': f'h{i + 1:03d}', 'settlement_id': near[i], 'type': HEALTH_TYPE,
                'name': name, 'name_np': name_np,
                'lat': h.geometry.y, 'lng': h.geometry.x, 'status': status,
            })
    return items
