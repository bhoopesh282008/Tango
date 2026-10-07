import sys
from pathlib import Path
from types import SimpleNamespace

import pytest
import requests

sys.path.insert(0, str(Path(__file__).parent.parent))

import fetch_osm  # noqa: E402

BBOX = '85.75,27.78,86.05,28.05'
ELEMENTS = [{'type': 'node', 'id': 1, 'lon': 85.9, 'lat': 27.9, 'tags': {'place': 'village', 'name': 'Barabise'}}]


def reply(status, body=None):
    def raise_for_status():
        if status >= 400:
            raise requests.HTTPError(f'{status} Error', response=SimpleNamespace(status_code=status))
    return SimpleNamespace(status_code=status, raise_for_status=raise_for_status,
                           json=lambda: body if body is not None else {'elements': ELEMENTS})


@pytest.fixture
def waited(monkeypatch):
    """Records the pauses instead of sleeping them."""
    pauses = []
    monkeypatch.setattr(fetch_osm.time, 'sleep', pauses.append)
    return pauses


def serve(monkeypatch, *outcomes):
    """requests.post answers with each outcome in turn: a reply, or an exception to raise."""
    calls = iter(outcomes)

    def post(*args, **kwargs):
        outcome = next(calls)
        if isinstance(outcome, Exception):
            raise outcome
        return outcome

    monkeypatch.setattr(fetch_osm.requests, 'post', post)


def test_a_busy_server_is_waited_for_and_then_answers(monkeypatch, waited):
    serve(monkeypatch, reply(504), reply(429), reply(200))
    said = []
    result = fetch_osm._overpass('places', BBOX, '2026-07-27', say=lambda text, **k: said.append(text))
    assert len(result['features']) == 1
    assert waited == [20, 60]                                   # the pauses grow
    assert 'HTTP 504' in said[0] and 'Waiting 20 s' in said[0] and '2 of 5' in said[0]


def test_a_dropped_connection_and_a_timeout_are_retried_too(monkeypatch, waited):
    serve(monkeypatch, requests.ConnectionError('reset'), requests.Timeout('slow'), reply(200))
    assert len(fetch_osm._overpass('places', BBOX, '2026-07-27', say=lambda *a, **k: None)['features']) == 1
    assert len(waited) == 2


def test_a_bad_query_is_not_retried(monkeypatch, waited):
    serve(monkeypatch, reply(400))
    with pytest.raises(requests.HTTPError):
        fetch_osm._overpass('places', BBOX, '2026-07-27', say=lambda *a, **k: None)
    assert waited == []


def test_a_service_that_stays_down_ends_in_a_message_that_says_what_to_do(monkeypatch, waited):
    serve(monkeypatch, *[reply(504)] * 5)
    with pytest.raises(fetch_osm.OverpassBusy) as error:
        fetch_osm._overpass('buildings', BBOX, '2026-07-27', say=lambda *a, **k: None)
    message = str(error.value)
    assert 'buildings layer (HTTP 504)' in message and 'after 5 tries over about 7 minutes' in message
    assert 'run the same command again' in message
    assert sum(waited) == sum(fetch_osm.OVERPASS_WAITS)


def test_it_is_a_runtime_error_so_run_py_prints_it_without_a_stack_trace():
    assert issubclass(fetch_osm.OverpassBusy, RuntimeError)


def test_the_optional_rivers_layer_falls_back_when_the_service_is_busy_but_the_others_do_not(monkeypatch):
    def layer(name, bbox, snapshot):
        if name in ('waterways', 'roads'):
            raise fetch_osm.OverpassBusy(f'{name} unavailable')
        return 'a layer'

    monkeypatch.setattr(fetch_osm, 'fetch_layer', layer)
    with pytest.raises(fetch_osm.OverpassBusy, match='roads'):      # roads comes before waterways and is needed
        fetch_osm.fetch_all(BBOX)
    monkeypatch.setattr(fetch_osm, 'fetch_layer', lambda name, *a: None if name == 'waterways' else 'a layer')
    layers = fetch_osm.fetch_all(BBOX)
    assert layers['buildings'] == 'a layer'

    def only_rivers_busy(name, *a):
        if name == 'waterways':
            raise fetch_osm.OverpassBusy('busy')
        return 'a layer'

    monkeypatch.setattr(fetch_osm, 'fetch_layer', only_rivers_busy)
    layers = fetch_osm.fetch_all(BBOX)
    assert layers['waterways'] is None and fetch_osm.SOURCES['waterways'] == 'unavailable'
