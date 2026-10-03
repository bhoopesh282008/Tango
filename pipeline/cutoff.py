"""Which settlements can no longer reach a hospital by road?"""
import networkx as nx
import numpy as np
from scipy.spatial import cKDTree
from shapely.geometry import LineString, MultiLineString


def _lines(geom):
    if isinstance(geom, LineString):
        return [geom]
    if isinstance(geom, MultiLineString):
        return list(geom.geoms)
    return []


def build_graph(roads, include_damaged):
    """Graph whose nodes are rounded road vertices (metric CRS expected)."""
    g = nx.Graph()
    for _, row in roads.iterrows():
        if row['damaged'] and not include_damaged:
            continue
        for line in _lines(row.geometry):
            pts = [(round(x, 1), round(y, 1)) for x, y in line.coords]
            for a, b in zip(pts, pts[1:]):
                g.add_edge(a, b, weight=((a[0] - b[0]) ** 2 + (a[1] - b[1]) ** 2) ** 0.5)
    return g


def snapper(g):
    """Function mapping a point to its nearest graph node within max_m, or None."""
    nodes = list(g.nodes)
    tree = cKDTree(np.array(nodes)) if nodes else None

    def snap(point, max_m):
        if tree is None:
            return None
        distance, index = tree.query([point.x, point.y], distance_upper_bound=max_m)
        return nodes[index] if np.isfinite(distance) else None

    return snap


def connectivity(settlements, destinations, roads, snap_m=500):
    """Return {settlement_id: bool | None}.

    True/False: still / no longer connected to any destination. None: the
    settlement had no route in the pre-event OSM roads either, so the event's
    effect cannot be told apart from missing map data.
    """
    crs = roads.estimate_utm_crs()
    roads, settlements, destinations = (x.to_crs(crs) for x in (roads, settlements, destinations))
    before = build_graph(roads, include_damaged=True)
    after = build_graph(roads, include_damaged=False)

    def components(g):
        return {n: i for i, c in enumerate(nx.connected_components(g)) for n in c}

    comp_b, comp_a = components(before), components(after)
    snap_b, snap_a = snapper(before), snapper(after)
    dest_b = {comp_b[n] for n in (snap_b(p, snap_m) for p in destinations.geometry) if n}
    dest_a = {comp_a[n] for n in (snap_a(p, snap_m) for p in destinations.geometry) if n}

    result = {}
    for _, s in settlements.iterrows():
        nb = snap_b(s.geometry, snap_m)
        if nb is None or comp_b[nb] not in dest_b:
            result[s['id']] = None
            continue
        na = snap_a(s.geometry, snap_m)
        result[s['id']] = bool(na is not None and comp_a[na] in dest_a)
    return result
