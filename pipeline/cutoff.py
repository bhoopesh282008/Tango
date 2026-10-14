"""Which settlements can no longer reach a hospital by road?

The answer is worked out on one graph of the pre-event roads, closed in one of two ways:

- 'ways' (the default): every mapped road that touches a water or debris zone is closed from end to
  end. This is the rule damage.flag_damaged uses for "in flood zone", and the one the dashboard's
  route planner avoids. It is coarse: the water often covers a few hundred metres of a long road.
- 'pieces': only the stretches between two road vertices that touch a zone are closed. A settlement
  cut off this way is cut off by the mapped flood itself; it is the firmer of the two answers.

Settlements and destinations are placed on the network once, on the pre-event roads. A settlement
whose own road is closed is not moved to some other road nearby (an earlier version snapped again
after the cut, and so reported a settlement as connected through a road 231 m away).
"""
import networkx as nx
import numpy as np
import shapely
from scipy.spatial import cKDTree
from shapely.geometry import LineString, MultiLineString

import damage

RULES = ('ways', 'pieces')


def _lines(geom):
    if isinstance(geom, LineString):
        return [geom]
    if isinstance(geom, MultiLineString):
        return list(geom.geoms)
    return []


def road_graph(roads):
    """The pre-event road graph. Nodes are rounded road vertices (metric CRS expected); OSM ways
    share a vertex at each junction. An edge is `open_way` when a road that is not flagged runs
    along it (two ways can share a stretch)."""
    g = nx.Graph()
    for _, row in roads.iterrows():
        flagged = bool(row['damaged'])
        for line in _lines(row.geometry):
            pts = [(round(x, 1), round(y, 1)) for x, y in line.coords]
            for a, b in zip(pts, pts[1:]):
                if a == b:
                    continue
                if g.has_edge(a, b):
                    g[a][b]['open_way'] = g[a][b]['open_way'] or not flagged
                else:
                    g.add_edge(a, b, weight=((a[0] - b[0]) ** 2 + (a[1] - b[1]) ** 2) ** 0.5, open_way=not flagged)
    return g


def closed_edges(g, rule='ways', zones=None):
    """The edges the flood closes under `rule`. 'pieces' needs the zones, in the graph's CRS."""
    if rule not in RULES:
        raise ValueError(f'rule must be one of {RULES}')
    if rule == 'ways':
        return [(a, b) for a, b, d in g.edges(data=True) if not d['open_way']]
    if zones is None:
        raise ValueError("the 'pieces' rule needs the flood zones")
    union = damage.flood_union(zones)
    edges = list(g.edges())
    if union is None or not edges:
        return []
    shapely.prepare(union)
    hit = shapely.intersects(shapely.linestrings(np.array(edges, dtype=float)), union)
    return [edge for edge, closed in zip(edges, hit) if closed]


def after_graph(g, closed):
    """The road graph after the flood: every node kept, the closed edges gone."""
    after = g.copy()
    after.remove_edges_from(closed)
    return after


def components(g):
    """{node: index of its connected piece}"""
    return {n: i for i, c in enumerate(nx.connected_components(g)) for n in c}


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


def connectivity(settlements, destinations, roads, snap_m=500, rule='ways', zones=None):
    """Return {settlement_id: bool | None}.

    True/False: still / no longer connected to any destination. None: the settlement had no route
    in the pre-event OSM roads either, so the event's effect cannot be told apart from missing map
    data. `rule` is how the flood closes roads (see the module notes); 'pieces' needs `zones`.
    """
    crs = roads.estimate_utm_crs()
    roads, settlements, destinations = (x.to_crs(crs) for x in (roads, settlements, destinations))
    if zones is not None:
        zones = zones.to_crs(crs)
    before = road_graph(roads)
    after = after_graph(before, closed_edges(before, rule, zones))
    comp_b, comp_a = components(before), components(after)
    snap = snapper(before)

    ends = [n for n in (snap(p, snap_m) for p in destinations.geometry) if n is not None]
    dest_b, dest_a = {comp_b[n] for n in ends}, {comp_a[n] for n in ends}

    result = {}
    for _, s in settlements.iterrows():
        node = snap(s.geometry, snap_m)
        if node is None or comp_b[node] not in dest_b:
            result[s['id']] = None
            continue
        result[s['id']] = comp_a[node] in dest_a
    return result
