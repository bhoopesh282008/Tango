"""The challenge's data rules, as tests that fail loudly if the code drifts.

Allowed inputs: Sentinel-1/2, Copernicus DEM, OpenStreetMap as it was before the event, and the
listed training sets. Copernicus EMS, UNOSAT and any published damage map may only be used to check
results; using them as an input is disqualification. These tests do not prove the science is right,
only that the run path cannot reach the reference by accident.
"""
import ast
import re
from datetime import date, timedelta
from pathlib import Path

import pytest

import config as C
import preflight

PIPELINE = Path(__file__).resolve().parents[1]
# Modules that exist to compare a result with a published map. The run must never import them.
CHECK_ONLY = {'validate'}
# Words that would mean a published damage map is being read.
REFERENCE_WORDS = re.compile(r'EMSR\d+|reference_emsr|unosat|copernicus emergency', re.IGNORECASE)


def imported_modules(path):
    tree = ast.parse(path.read_text(encoding='utf-8'))
    found = set()
    for node in ast.walk(tree):
        if isinstance(node, ast.Import):
            found.update(a.name.split('.')[0] for a in node.names)
        elif isinstance(node, ast.ImportFrom) and node.module and node.level == 0:
            found.add(node.module.split('.')[0])
    return found


def run_path(entry='run'):
    """Every pipeline module the end-to-end run can reach, by import (including lazy imports)."""
    local = {p.stem for p in PIPELINE.glob('*.py')}
    seen, todo = set(), [entry]
    while todo:
        name = todo.pop()
        if name in seen:
            continue
        seen.add(name)
        todo.extend(m for m in imported_modules(PIPELINE / f'{name}.py') if m in local)
    return seen


def test_the_run_never_imports_the_comparison_with_published_maps():
    reachable = run_path('run')
    assert 'run' in reachable and 'segment' in reachable    # the walk is really walking
    assert not (reachable & CHECK_ONLY), f'run.py reaches {reachable & CHECK_ONLY}, which is for checking only'


def test_nothing_the_run_reaches_names_a_published_damage_map():
    for name in run_path('run'):
        source = (PIPELINE / f'{name}.py').read_text(encoding='utf-8')
        assert not REFERENCE_WORDS.search(source), f'{name}.py mentions a published damage map'


def test_the_comparison_is_the_only_place_that_does():
    # If this stops being true, the guard above is looking in the wrong place.
    assert REFERENCE_WORDS.search((PIPELINE / 'validate.py').read_text(encoding='utf-8'))


@pytest.mark.parametrize('event', ['2026-08-26', '2026-08-27', '2027-01-01', '2024-07-15', '2020-06-01', '2015-05-01'])
def test_the_openstreetmap_snapshot_is_always_before_the_event(event):
    snapshot = date.fromisoformat(C.osm_snapshot_for(event))
    assert snapshot < date.fromisoformat(event)
    assert snapshot <= date.fromisoformat(C.OSM_SNAPSHOT)       # and never later than the brief's snapshot


def test_a_snapshot_that_reaches_the_event_is_a_preflight_problem(monkeypatch, tmp_path):
    monkeypatch.setattr(C, 'osm_snapshot_for', lambda event: str(event))
    with pytest.raises(preflight.PreflightError) as error:
        preflight.check('85.1,27.9,85.3,28.1', '2026-08-26', tmp_path, need_scenes=False)
    assert 'OpenStreetMap snapshot' in str(error.value)


def test_a_normal_event_passes_the_snapshot_check(tmp_path):
    day = date.today() - timedelta(days=200)
    assert preflight.check('85.1,27.9,85.3,28.1', day.isoformat(), tmp_path, need_scenes=False) == []
