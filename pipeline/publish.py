"""Publish a finished run to the dashboard.

    python publish.py out/trishuli --name "Trishuli corridor, Rasuwa, Nepal"

Copies the run's dashboard files to ../public/data/<id>/ and lists the run in
../public/data/runs.json, which the dashboard reads for its area selector. The
newest run is listed first and is the one the dashboard opens on. `run.py
--publish` does this as its last step, so a new area appears in a running
dashboard on reload.
"""
import argparse
import json
import re
import shutil
from datetime import datetime
from pathlib import Path

import config as C

TARGET = C.ROOT.parent / 'public' / 'data'
# What the dashboard reads. The rasters stay in the run folder.
FILES = ['flood_zones.geojson', 'buildings.geojson', 'roads.geojson', 'infrastructure.json',
         'settlements.json', 'attribution.json', 'dem.json', 'dem.bin']


def run_id(name):
    """A folder and URL name: 'Trishuli corridor, Rasuwa' -> 'trishuli-corridor-rasuwa'."""
    return re.sub(r'[^a-z0-9]+', '-', name.lower()).strip('-') or 'run'


def publish(out_dir, name=None, target=TARGET):
    """Copy a run to the dashboard's data folder and put it first in the list of runs."""
    out_dir, target = Path(out_dir), Path(target)
    satellite = json.loads((out_dir / 'satellite.json').read_text(encoding='utf-8'))
    area = satellite.get('area') or {}
    name = name or area.get('name') or out_dir.name
    satellite['area'] = {**area, 'name': name}

    folder = target / run_id(name)
    folder.mkdir(parents=True, exist_ok=True)
    for path in [out_dir / f for f in FILES] + sorted(out_dir.glob('*.png')):
        if path.exists():
            shutil.copy2(path, folder / path.name)
    (folder / 'satellite.json').write_text(
        json.dumps(satellite, ensure_ascii=False, separators=(',', ':')), encoding='utf-8')

    entry = {
        'id': folder.name,
        'name': name,
        'event': satellite.get('event'),
        'bbox': area.get('bbox'),
        'before': (satellite.get('before') or {}).get('date'),
        'after': (satellite.get('after') or {}).get('date'),
        'published': datetime.now().isoformat(timespec='seconds'),
    }
    index = target / 'runs.json'
    runs = json.loads(index.read_text(encoding='utf-8')) if index.exists() else []
    runs = [entry] + [r for r in runs if r.get('id') != entry['id']]
    index.write_text(json.dumps(runs, ensure_ascii=False, indent=2), encoding='utf-8')
    return entry


def main():
    parser = argparse.ArgumentParser(description=__doc__.split('\n')[0])
    parser.add_argument('out_dir')
    parser.add_argument('--name', help='how the dashboard names this area; default: the name the run recorded')
    args = parser.parse_args()
    entry = publish(args.out_dir, args.name)
    print(f"Published '{entry['name']}' as {entry['id']}. Reload the dashboard to see it.")


if __name__ == '__main__':
    main()
