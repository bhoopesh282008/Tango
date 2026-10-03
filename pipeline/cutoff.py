"""Which settlements can no longer reach a hospital by road?"""
import networkx as nx
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


def _snap(g, point, max_m):
    best, best_d = None, max_m
    for n in g.nodes:
        d = ((n[0] - point.x) ** 2 + (n[1] - point.y) ** 2) ** 0.5
        if d < best_d:
            best, best_d = n, d
    return best


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
    dest_b = {comp_b[n] for n in (_snap(before, p, snap_m) for p in destinations.geometry) if n}
    dest_a = {comp_a[n] for n in (_snap(after, p, snap_m) for p in destinations.geometry) if n}

    result = {}
    for _, s in settlements.iterrows():
        nb = _snap(before, s.geometry, snap_m)
        if nb is None or comp_b[nb] not in dest_b:
            result[s['id']] = None
            continue
        na = _snap(after, s.geometry, snap_m)
        result[s['id']] = bool(na is not None and comp_a[na] in dest_a)
    return result
