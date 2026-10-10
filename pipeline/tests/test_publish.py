import json
import shutil
import sys
from pathlib import Path

import pytest

sys.path.insert(0, str(Path(__file__).parent.parent))

import publish  # noqa: E402


def finished_run(folder, name='Area A', extra=()):
    """A minimal finished run: the files the dashboard needs, and any `extra` ones."""
    folder.mkdir(parents=True, exist_ok=True)
    for file in publish.REQUIRED + list(extra):
        (folder / file).write_text('{}', encoding='utf-8')
    (folder / 'satellite.json').write_text(json.dumps({
        'event': '2026-08-26', 'area': {'name': name, 'bbox': [1, 2, 3, 4]},
        'before': {'date': '2026-08-16'}, 'after': {'date': '2026-08-28'},
    }), encoding='utf-8')
    return folder


def listed(target):
    return json.loads((target / 'runs.json').read_text(encoding='utf-8'))


def test_a_published_run_is_listed_first_with_its_dates(tmp_path):
    target = tmp_path / 'data'
    publish.publish(finished_run(tmp_path / 'a', 'Area A'), target=target)
    entry = publish.publish(finished_run(tmp_path / 'b', 'Area B'), target=target)
    assert entry['id'] == 'area-b'
    assert [r['id'] for r in listed(target)] == ['area-b', 'area-a']
    assert listed(target)[0]['before'] == '2026-08-16' and listed(target)[0]['bbox'] == [1, 2, 3, 4]


def test_publishing_again_replaces_the_run_and_leaves_no_stale_files(tmp_path):
    target = tmp_path / 'data'
    publish.publish(finished_run(tmp_path / 'a', extra=['before_optical.png']), target=target)
    assert (target / 'area-a' / 'dem.json').exists() is False
    (tmp_path / 'a' / 'before_optical.png').unlink()
    publish.publish(tmp_path / 'a', target=target)
    assert not (target / 'area-a' / 'before_optical.png').exists()
    assert [r['id'] for r in listed(target)] == ['area-a']


def test_an_unfinished_run_is_refused_and_nothing_changes(tmp_path):
    target = tmp_path / 'data'
    publish.publish(finished_run(tmp_path / 'a'), target=target)
    broken = finished_run(tmp_path / 'b')
    (broken / 'roads.geojson').unlink()
    with pytest.raises(FileNotFoundError, match='missing roads.geojson'):
        publish.publish(broken, target=target)
    assert [r['id'] for r in listed(target)] == ['area-a']
    assert not (target / 'area-b').exists()


def test_a_failure_half_way_leaves_the_earlier_publication_untouched(tmp_path, monkeypatch):
    target = tmp_path / 'data'
    publish.publish(finished_run(tmp_path / 'a'), target=target)
    (target / 'area-a' / 'flood_zones.geojson').write_text('{"old": true}', encoding='utf-8')
    before_list = (target / 'runs.json').read_text(encoding='utf-8')

    real_copy, calls = shutil.copy2, []

    def failing_copy(src, dst, *args, **kwargs):
        calls.append(src)
        if len(calls) == 3:
            raise OSError('disk full')
        return real_copy(src, dst, *args, **kwargs)

    monkeypatch.setattr(publish.shutil, 'copy2', failing_copy)
    with pytest.raises(OSError, match='disk full'):
        publish.publish(tmp_path / 'a', target=target)

    assert (target / 'area-a' / 'flood_zones.geojson').read_text(encoding='utf-8') == '{"old": true}'
    assert (target / 'runs.json').read_text(encoding='utf-8') == before_list
    assert sorted(p.name for p in target.iterdir()) == ['area-a', 'runs.json']   # no half-made folders


def test_a_damaged_list_is_rebuilt_from_the_run_folders(tmp_path, capsys):
    target = tmp_path / 'data'
    publish.publish(finished_run(tmp_path / 'a', 'Area A'), target=target)
    (target / 'runs.json').write_text('<<< not json', encoding='utf-8')
    publish.publish(finished_run(tmp_path / 'b', 'Area B'), target=target)
    assert 'could not be read' in capsys.readouterr().out
    assert [r['id'] for r in listed(target)] == ['area-b', 'area-a']
    assert listed(target)[1]['name'] == 'Area A'


def test_leftovers_of_a_cut_off_attempt_are_cleared(tmp_path):
    target = tmp_path / 'data'
    (target / '.area-a.new').mkdir(parents=True)
    (target / '.area-a.new' / 'junk').write_text('x')
    publish.publish(finished_run(tmp_path / 'a'), target=target)
    assert sorted(p.name for p in target.iterdir()) == ['area-a', 'runs.json']


def test_the_context_file_is_published_only_when_asked_for(tmp_path):
    target = tmp_path / 'data'
    run = finished_run(tmp_path / 'a', extra=['context.json'])
    publish.publish(run, target=target)
    assert not (target / 'area-a' / 'context.json').exists()
    publish.publish(run, target=target, with_context=True)
    assert (target / 'area-a' / 'context.json').exists()
    publish.publish(run, target=target)                      # and a republish leaves no stale copy
    assert not (target / 'area-a' / 'context.json').exists()
