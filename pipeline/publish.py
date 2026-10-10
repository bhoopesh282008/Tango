"""Publish a finished run to the dashboard.

    python publish.py out/trishuli --name "Trishuli corridor, Rasuwa, Nepal"

Copies the run's dashboard files to ../public/data/<id>/ and lists the run in
../public/data/runs.json, which the dashboard reads for its area selector. The
newest run is listed first and is the one the dashboard opens on. `run.py
--publish` does this as its last step, so a new area appears in a running
dashboard on reload.

Publishing is all or nothing: the run is copied into a side folder and swapped in
only when it is complete, and the list is replaced in one step. A failure half way
(a full disk, a file in use) leaves what was published before exactly as it was.
"""
import argparse
import json
import os
import re
import shutil
from datetime import datetime
from pathlib import Path

import config as C

TARGET = C.ROOT.parent / 'public' / 'data'
# What the dashboard reads. The rasters stay in the run folder.
FILES = ['flood_zones.geojson', 'buildings.geojson', 'roads.geojson', 'infrastructure.json',
         'settlements.json', 'attribution.json', 'outlines.json', 'dem.json', 'dem.bin']
# Population and river-flow context from datasets the brief does not list as inputs: only on request
CONTEXT_FILE = 'context.json'
# Without these the dashboard cannot show the run at all (the rest are optional extras)
REQUIRED = ['satellite.json', 'flood_zones.geojson', 'buildings.geojson', 'roads.geojson',
            'infrastructure.json', 'settlements.json']


def run_id(name):
    """A folder and URL name: 'Trishuli corridor, Rasuwa' -> 'trishuli-corridor-rasuwa'."""
    return re.sub(r'[^a-z0-9]+', '-', name.lower()).strip('-') or 'run'


def _entry(folder_name, name, satellite):
    area = satellite.get('area') or {}
    return {
        'id': folder_name,
        'name': name,
        'event': satellite.get('event'),
        'bbox': area.get('bbox'),
        'before': (satellite.get('before') or {}).get('date'),
        'after': (satellite.get('after') or {}).get('date'),
        'published': datetime.now().isoformat(timespec='seconds'),
    }


def _read_list(index, target):
    """The published runs. A list that cannot be read is rebuilt from the run folders, so one bad
    file never hides every area from the dashboard."""
    if not index.exists():
        return []
    try:
        runs = json.loads(index.read_text(encoding='utf-8'))
        if isinstance(runs, list):
            return runs
    except ValueError:
        pass
    print(f'Warning: {index} could not be read; rebuilding the list from the run folders.')
    rebuilt = []
    for folder in sorted(p for p in target.iterdir() if p.is_dir() and not p.name.startswith('.')):
        try:
            satellite = json.loads((folder / 'satellite.json').read_text(encoding='utf-8'))
        except (OSError, ValueError):
            continue
        rebuilt.append(_entry(folder.name, (satellite.get('area') or {}).get('name') or folder.name, satellite))
    return rebuilt


def publish(out_dir, name=None, target=TARGET, with_context=False):
    """Copy a run to the dashboard's data folder and put it first in the list of runs.

    A run's context.json (modelled population, river flow) is left behind unless `with_context`."""
    out_dir, target = Path(out_dir), Path(target)
    missing = [f for f in REQUIRED if not (out_dir / f).exists()]
    if missing:
        raise FileNotFoundError(
            f'{out_dir} is not a finished run: missing {", ".join(missing)}. Run run.py first, and wait for it to finish.')
    satellite = json.loads((out_dir / 'satellite.json').read_text(encoding='utf-8'))
    area = satellite.get('area') or {}
    name = name or area.get('name') or out_dir.name
    satellite['area'] = {**area, 'name': name}

    target.mkdir(parents=True, exist_ok=True)
    folder = target / run_id(name)
    staging, previous = target / f'.{folder.name}.new', target / f'.{folder.name}.old'
    for leftover in (staging, previous):     # from an earlier attempt that was cut off
        shutil.rmtree(leftover, ignore_errors=True)
    staging.mkdir()
    try:
        for path in [out_dir / f for f in FILES + ([CONTEXT_FILE] if with_context else [])] + sorted(out_dir.glob('*.png')):
            if path.exists():
                shutil.copy2(path, staging / path.name)
        (staging / 'satellite.json').write_text(
            json.dumps(satellite, ensure_ascii=False, separators=(',', ':')), encoding='utf-8')
        # The swap: the complete copy replaces the old one (and so does not inherit its stale files)
        if folder.exists():
            folder.rename(previous)
        staging.rename(folder)
    except BaseException:
        shutil.rmtree(staging, ignore_errors=True)
        if previous.exists() and not folder.exists():
            previous.rename(folder)          # put back what was there before
        raise
    shutil.rmtree(previous, ignore_errors=True)

    entry = _entry(folder.name, name, satellite)
    index = target / 'runs.json'
    runs = [entry] + [r for r in _read_list(index, target) if r.get('id') != entry['id']]
    scratch = index.with_name('runs.json.tmp')
    scratch.write_text(json.dumps(runs, ensure_ascii=False, indent=2), encoding='utf-8')
    os.replace(scratch, index)               # one step: readers see the old list or the new one
    return entry


def main():
    parser = argparse.ArgumentParser(description=__doc__.split('\n')[0])
    parser.add_argument('out_dir')
    parser.add_argument('--name', help='how the dashboard names this area; default: the name the run recorded')
    parser.add_argument('--with-context', action='store_true',
                        help="also publish the run's context.json (modelled population and river flow); left out by default")
    args = parser.parse_args()
    try:
        entry = publish(args.out_dir, args.name, with_context=args.with_context)
    except FileNotFoundError as error:
        raise SystemExit(f'Not published: {error}') from None
    print(f"Published '{entry['name']}' as {entry['id']}. Reload the dashboard to see it.")


if __name__ == '__main__':
    main()
