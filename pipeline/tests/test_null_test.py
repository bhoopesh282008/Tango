from datetime import date
from types import SimpleNamespace

import null_test


def item(day, orbit=85, state='ascending', geometry=None):
    return SimpleNamespace(
        properties={'datetime': f'{day}T12:00:00Z', 'sat:relative_orbit': orbit, 'sat:orbit_state': state},
        geometry=geometry, id=f'{orbit}-{day}')


PRE = date(2026, 8, 16)


def test_takes_the_scenes_12_and_24_days_before_on_the_same_track():
    items = [item('2026-08-04'), item('2026-07-23'), item('2026-07-11'), item('2026-08-16')]
    chosen = null_test.choose_history(items, 85, 'ascending', PRE)
    assert [i.id for i in chosen] == ['85-2026-08-04', '85-2026-07-23']


def test_a_scene_on_another_track_or_direction_is_never_used():
    items = [item('2026-08-04', orbit=19, state='descending'), item('2026-08-04', state='descending'), item('2026-07-23')]
    chosen = null_test.choose_history(items, 85, 'ascending', PRE)
    assert [i.id for i in chosen] == []          # the 12-day scene is missing, so the series stops there


def test_it_stops_at_a_gap_and_keeps_what_it_found():
    chosen = null_test.choose_history([item('2026-08-04'), item('2026-07-11')], 85, 'ascending', PRE)
    assert [i.id for i in chosen] == ['85-2026-08-04']


def test_a_scene_a_day_or_two_off_the_repeat_is_accepted_and_the_nearest_wins():
    items = [item('2026-08-05'), item('2026-08-03'), item('2026-08-04')]
    assert null_test.choose_history(items, 85, 'ascending', PRE, count=1)[0].id == '85-2026-08-04'
    assert null_test.choose_history([item('2026-08-02')], 85, 'ascending', PRE, count=1)[0].id == '85-2026-08-02'
    assert null_test.choose_history([item('2026-07-28')], 85, 'ascending', PRE, count=1) == []


def test_a_scene_that_does_not_cover_the_area_is_left_out():
    half = {'type': 'Polygon', 'coordinates': [[[0, 0], [0.5, 0], [0.5, 1], [0, 1], [0, 0]]]}
    whole = {'type': 'Polygon', 'coordinates': [[[-1, -1], [2, -1], [2, 2], [-1, 2], [-1, -1]]]}
    items = [item('2026-08-04', geometry=half), item('2026-08-03', geometry=whole)]
    chosen = null_test.choose_history(items, 85, 'ascending', PRE, count=1, bbox='0,0,1,1')
    assert [i.id for i in chosen] == ['85-2026-08-03']


def test_attach_records_a_short_summary_next_to_the_rest_of_the_run(tmp_path):
    import json
    (tmp_path / 'satellite.json').write_text(json.dumps({'event': '2026-08-26', 'validation': {'areas': 3}}), encoding='utf-8')
    real = {'water': 1.6, 'debris': 0.9, 'uncertain': 0.1}
    result = null_test.summarise(real, [{'pair': 'a to b', 'water': 0.2, 'debris': 0.05, 'uncertain': 0.0}])
    null_test.attach(tmp_path, result)
    saved = json.loads((tmp_path / 'satellite.json').read_text(encoding='utf-8'))
    assert saved['validation'] == {'areas': 3} and saved['event'] == '2026-08-26'      # nothing else touched
    assert saved['null_test'] == {'real_flood_km2': 2.5, 'worst_share_of_real': 0.1,
                                  'pairs': [{'pair': 'a to b', 'flood_km2': 0.25, 'share_of_real': 0.1}]}


def test_the_summary_gives_each_no_change_pair_as_a_share_of_the_real_flood():
    real = {'water': 1.6, 'debris': 0.9, 'uncertain': 0.1}
    nulls = [{'pair': 'a to b', 'water': 0.2, 'debris': 0.05, 'uncertain': 0.0},
             {'pair': 'b to c', 'water': 0.5, 'debris': 0.0, 'uncertain': 0.3}]
    result = null_test.summarise(real, nulls)
    assert result['real_flood_km2'] == 2.5
    assert [r['share_of_real'] for r in result['no_change_pairs']] == [0.1, 0.2]
    assert result['worst_share_of_real'] == 0.2
    assert null_test.summarise({'water': 0, 'debris': 0, 'uncertain': 0}, nulls)['worst_share_of_real'] is None
