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
    joined = gpd.sjoin_nearest(points.to_crs(crs), settlements.to_crs(crs)[['id', 'geometry']], how='left')
    joined = joined[~joined.index.duplicated()]
    return joined['id'].reindex(points.index).tolist()


def _text(value):
    return value if isinstance(value, str) and value else None


def _name(row, fallback):
    return _text(row.get('name')) or fallback


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
            items.append({
                'id': f'b{i + 1:03d}', 'settlement_id': near[i], 'type': 'bridge',
                'name': _name(b, 'Unnamed bridge'), 'name_np': _text(b.get('name:ne')),
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
            items.append({
                'id': f'h{i + 1:03d}', 'settlement_id': near[i], 'type': HEALTH_TYPE,
                'name': _name(h, 'Unnamed health facility'), 'name_np': _text(h.get('name:ne')),
                'lat': h.geometry.y, 'lng': h.geometry.x, 'status': status,
            })
    return items
