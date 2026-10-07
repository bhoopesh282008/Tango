import sys
from datetime import date
from pathlib import Path

import pytest

sys.path.insert(0, str(Path(__file__).parent.parent))

import config as C  # noqa: E402
import preflight  # noqa: E402

TRISHULI = '85.1,27.9,85.45,28.32'
TODAY = date(2026, 10, 7)


@pytest.fixture
def keys(monkeypatch):
    """Copernicus S3 keys present (placeholders; nothing is contacted)."""
    monkeypatch.setenv('AWS_ACCESS_KEY_ID', 'x')
    monkeypatch.setenv('AWS_SECRET_ACCESS_KEY', 'y')


@pytest.fixture
def no_credentials(monkeypatch):
    monkeypatch.delenv('AWS_ACCESS_KEY_ID', raising=False)
    monkeypatch.delenv('AWS_SECRET_ACCESS_KEY', raising=False)
    monkeypatch.setattr(C, 'CDSE_USER', None)
    monkeypatch.setattr(C, 'CDSE_PASSWORD', None)


def check(tmp_path, bbox=TRISHULI, event='2026-08-26', **options):
    return preflight.check(bbox, event, tmp_path / 'out', today=TODAY, **options)


def problems_of(tmp_path, **kwargs):
    with pytest.raises(preflight.PreflightError) as error:
        check(tmp_path, **kwargs)
    return error.value.problems


# --- the area -----------------------------------------------------------------------------

def test_a_good_area_parses():
    assert preflight.parse_bbox('85.1,27.9,85.45,28.32') == (85.1, 27.9, 85.45, 28.32)
    assert preflight.parse_bbox(' 85.1 , 27.9 , 85.45 , 28.32 ') == (85.1, 27.9, 85.45, 28.32)


@pytest.mark.parametrize('text', ['85.1,27.9,85.45', '85.1,27.9,85.45,28.32,1', 'a,b,c,d', '', '85.1;27.9;85.45;28.32'])
def test_a_malformed_area_is_explained(text):
    with pytest.raises(ValueError, match='W,S,E,N'):
        preflight.parse_bbox(text)


@pytest.mark.parametrize('text', ['85.45,27.9,85.1,28.32', '85.1,28.32,85.45,27.9', '185,27.9,186,28.32', '85.1,95,85.45,96'])
def test_an_area_the_wrong_way_round_or_off_the_globe_is_refused(text):
    with pytest.raises(ValueError, match='west < east and south < north'):
        preflight.parse_bbox(text)


def test_the_case_study_area_passes_and_the_output_folder_is_made(tmp_path, keys):
    assert check(tmp_path) == []
    assert (tmp_path / 'out').is_dir()


def test_an_area_larger_than_anything_tried_is_refused_with_the_size(tmp_path, keys):
    problems = problems_of(tmp_path, bbox='84.5,27.5,85.5,28.5')
    assert 'larger than anything this pipeline has run on' in problems[0]
    assert '1.00 square degrees' in problems[0]


def test_a_big_but_allowed_area_warns(tmp_path, keys):
    warnings = check(tmp_path, bbox='85.0,27.8,85.55,28.32')
    assert any('larger than the case studies' in w for w in warnings)


def test_a_tiny_area_is_refused(tmp_path, keys):
    assert 'too small' in problems_of(tmp_path, bbox='85.1,27.9,85.102,28.32')[0]


def test_latitude_and_longitude_swapped_near_the_pole_is_called_out(tmp_path, keys):
    # Nepal written as lat,lon: valid numbers, absurd place
    warnings = check(tmp_path, bbox='27.9,84.0,28.2,84.3')
    assert any('W,S,E,N (longitude first)' in w for w in warnings)


# --- the date ------------------------------------------------------------------------------

def test_a_date_that_is_not_a_date_says_the_format(tmp_path, keys):
    assert 'YYYY-MM-DD' in problems_of(tmp_path, event='26/08/2026')[0]


def test_an_event_in_the_future_is_refused(tmp_path, keys):
    assert 'in the future' in problems_of(tmp_path, event='2026-12-01')[0]


def test_an_event_before_sentinel_1_is_refused(tmp_path, keys):
    assert 'before Sentinel-1 began' in problems_of(tmp_path, event='2013-06-01')[0]


def test_a_very_recent_event_warns_that_the_after_image_may_not_exist(tmp_path, keys):
    warnings = check(tmp_path, event='2026-10-01')
    assert any('may not exist yet' in w for w in warnings)


def test_a_date_with_ready_made_rasters_needs_no_recency_warning(tmp_path):
    assert check(tmp_path, event='2026-10-01', need_scenes=False) == []


# --- credentials ---------------------------------------------------------------------------

def test_missing_credentials_say_how_to_get_and_set_them(tmp_path, no_credentials):
    message = problems_of(tmp_path)[0]
    assert 'eodata-s3keysmanager.dataspace.copernicus.eu' in message
    assert 'AWS_ACCESS_KEY_ID' in message and 'set_cdse_keys.ps1' in message


def test_ready_made_rasters_need_no_credentials(tmp_path, no_credentials):
    assert check(tmp_path, need_scenes=False) == []


def test_a_username_and_password_will_do_for_radar_but_not_for_optical(tmp_path, no_credentials, monkeypatch):
    monkeypatch.setattr(C, 'CDSE_USER', 'someone')
    monkeypatch.setattr(C, 'CDSE_PASSWORD', 'secret')
    assert check(tmp_path) == []
    assert '--optical' in problems_of(tmp_path, optical=True)[0]


def test_the_message_never_contains_the_keys(tmp_path, monkeypatch):
    monkeypatch.delenv('AWS_ACCESS_KEY_ID', raising=False)
    monkeypatch.setenv('AWS_SECRET_ACCESS_KEY', 'TOPSECRETVALUE')
    monkeypatch.setattr(C, 'CDSE_USER', None)
    assert 'TOPSECRETVALUE' not in str(problems_of(tmp_path))


# --- all at once, and the output folder -----------------------------------------------------

def test_every_problem_is_reported_together(tmp_path, no_credentials):
    problems = problems_of(tmp_path, bbox='nonsense', event='tomorrow')
    assert len(problems) == 3
    with pytest.raises(preflight.PreflightError, match='cannot start') as error:
        check(tmp_path, bbox='nonsense', event='tomorrow')
    assert str(error.value).count('\n  - ') == 3


def test_an_output_folder_that_cannot_be_made_is_reported(tmp_path, keys):
    blocker = tmp_path / 'file'
    blocker.write_text('not a folder')
    with pytest.raises(preflight.PreflightError, match='Cannot write to the output folder'):
        preflight.check(TRISHULI, '2026-08-26', blocker / 'out', today=TODAY)


# --- which OpenStreetMap snapshot a run may use ----------------------------------------------

@pytest.mark.parametrize('event, snapshot', [
    ('2026-08-26', '2026-07-27'),     # the case study: the brief's snapshot, unchanged
    ('2026-09-15', '2026-07-27'),     # a later event still uses it
    ('2026-07-27', '2026-06-27'),     # an event on the snapshot's own day needs an earlier one
    ('2025-07-10', '2025-06-10'),     # an earlier event: 30 days before it
    ('2023-01-01', '2022-12-02'),
])
def test_the_snapshot_never_reaches_the_event(event, snapshot):
    assert C.osm_snapshot_for(event) == snapshot
    assert C.osm_snapshot_for(event) < event
    assert C.osm_snapshot_for(date.fromisoformat(event)) == snapshot
