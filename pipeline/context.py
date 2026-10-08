"""Context for the situation report that is NOT part of the map.

Two open datasets say something about the area that the satellite pair cannot:

* WorldPop: modelled people per 100 m cell, shared out over the buildings already mapped, so a
  settlement gets a modelled head count where OpenStreetMap records none.
* Open-Meteo Flood API (GloFAS): the modelled river flow on the event date against what is normal
  for that time of year.

They are written to their own file, context.json, and nothing in the flood, damage or cut-off
numbers reads it: the challenge allows only Sentinel-1/2, Copernicus DEM and pre-event OpenStreetMap
as inputs, so these are shown beside the map, labelled with their source and limits, and never
inside it. Every function fails soft: no network or no coverage means no context, not a failed run.
"""
import json
import os
from datetime import date, timedelta
from pathlib import Path

import numpy as np
import pandas as pd

import config as C

WORLDPOP_URL = ('https://data.worldpop.org/GIS/Population/Global_2015_2030/R2025A/2020/{iso}/v1/100m/'
                'constrained/{low}_pop_2020_CN_100m_R2025A_v1.tif')
FLOOD_API = 'https://flood-api.open-meteo.com/v1/flood'
# Rough outer boxes (W, S, E, N) of the countries a Himalayan valley can be in. They overlap at
# borders, so the smallest box that holds the area is tried first and the others after it.
COUNTRIES = {
    'NPL': (80.0, 26.3, 88.2, 30.5),
    'BTN': (88.7, 26.7, 92.2, 28.4),
    'BGD': (88.0, 20.7, 92.7, 26.6),
    'PAK': (60.8, 23.6, 77.9, 37.1),
    'IND': (68.1, 6.7, 97.4, 35.7),
    'CHN': (73.5, 18.2, 135.1, 53.6),
}
# WorldPop's server cannot send part of a file, so a country is downloaded whole and kept. Nepal is
# 31 MB, Bhutan 2, Bangladesh 54, Pakistan 139; India (759) and China (920) are over the limit.
POPULATION_CACHE = C.CACHE / 'worldpop'
MAX_DOWNLOAD_MB = 160
SEASON_DAYS = 15          # the "same time of year" window either side of the event, in days
MIN_YEARS = 10            # fewer years of history than this and "normal for the season" is not claimed

ATTRIBUTION = [
    'Population: WorldPop (www.worldpop.org), 2020 constrained 100 m estimates, R2025A, CC BY 4.0.',
    'River flow: Open-Meteo Flood API, GloFAS river discharge reanalysis, CC BY 4.0 (open-meteo.com).',
]


def candidate_countries(bbox):
    """ISO codes whose rough box holds the centre of bbox (W,S,E,N), smallest box first."""
    west, south, east, north = bbox
    lon, lat = (west + east) / 2, (south + north) / 2
    found = [(iso, (b[2] - b[0]) * (b[3] - b[1])) for iso, b in COUNTRIES.items()
             if b[0] <= lon <= b[2] and b[1] <= lat <= b[3]]
    return [iso for iso, _ in sorted(found, key=lambda item: item[1])]


def worldpop_url(iso):
    return WORLDPOP_URL.format(iso=iso, low=iso.lower())


def download_worldpop(iso, say=print, max_mb=MAX_DOWNLOAD_MB, folder=None):
    """Path of the cached WorldPop file for a country, downloading it first if needed; None if it cannot be had."""
    import requests
    folder = Path(folder or POPULATION_CACHE)
    path = folder / f'{iso.lower()}_pop_2020_CN_100m_R2025A_v1.tif'
    if path.exists():
        return str(path)
    url = worldpop_url(iso)
    try:
        head = requests.head(url, allow_redirects=True, timeout=30)
        if head.status_code != 200:
            return None                       # no file for this country: not an error
        size = int(head.headers.get('content-length', 0))
        if size > max_mb * 1e6:
            say(f'  Context: the WorldPop file for {iso} is {size / 1e6:.0f} MB, over the {max_mb} MB limit; no population for this area')
            return None
        say(f'  Context: downloading WorldPop population for {iso} ({size / 1e6:.0f} MB, kept for later runs)')
        folder.mkdir(parents=True, exist_ok=True)
        part = path.with_suffix('.part')
        with requests.get(url, stream=True, timeout=120) as response:
            response.raise_for_status()
            with open(part, 'wb') as file:
                for chunk in response.iter_content(1 << 20):
                    file.write(chunk)
        os.replace(part, path)               # a cut-off download is never mistaken for the file
        return str(path)
    except Exception as error:
        say(f'  Context: could not get the WorldPop file for {iso} ({type(error).__name__})')
        return None


def read_population(bbox, files):
    """People per cell inside bbox, from the first of `files` (paths, or None to skip) that has data there.

    `files` may be a generator, so a country is downloaded only when the one before it had nothing.
    Returns (array, transform, path) or None.
    """
    import rasterio
    from rasterio.windows import Window, from_bounds
    for url in files:
        if url is None:
            continue
        try:
            with rasterio.open(url) as src:
                wanted = from_bounds(*bbox, transform=src.transform).round_offsets().round_lengths()
                window = wanted.intersection(Window(0, 0, src.width, src.height))    # the part the file covers
                data = src.read(1, window=window)
                transform = src.window_transform(window)
                nodata = src.nodata
        except Exception:      # no such country file, no network, no overlap, not a raster: try the next
            continue
        cells = data.astype('float64')
        if nodata is not None:
            cells[cells == nodata] = np.nan
        cells[cells < 0] = np.nan
        if np.isfinite(cells).any() and np.nansum(cells) > 0:
            return cells, transform, url
    return None


def share_over_buildings(buildings, cells, transform):
    """People per settlement: each cell's people shared equally among the buildings whose centre is in it.

    Cell totals are conserved wherever a cell holds a building; people in cells with no mapped building
    are left out, so the figure is people in mapped buildings, not the settlement's whole population.
    `buildings` needs `settlement_id` and a geometry in lon/lat.
    """
    points = buildings.to_crs('EPSG:4326').geometry.representative_point()
    cols = np.floor((points.x.to_numpy() - transform.c) / transform.a).astype(int)
    rows = np.floor((points.y.to_numpy() - transform.f) / transform.e).astype(int)
    inside = (rows >= 0) & (rows < cells.shape[0]) & (cols >= 0) & (cols < cells.shape[1])
    frame = pd.DataFrame({'settlement': buildings['settlement_id'].to_numpy(), 'row': rows, 'col': cols})[inside]
    frame = frame[frame['settlement'].notna()]
    frame['people'] = cells[frame['row'].to_numpy(), frame['col'].to_numpy()]
    frame = frame[np.isfinite(frame['people'])]
    if frame.empty:
        return {}
    frame['share'] = frame['people'] / frame.groupby(['row', 'col'])['people'].transform('size')
    return {k: round(float(v), 1) for k, v in frame.groupby('settlement')['share'].sum().items()}


def population_context(bbox, buildings, files=None, reader=read_population, say=print):
    """Modelled people per settlement. `files`: WorldPop rasters to try; default, the countries around bbox."""
    if not len(buildings) or 'settlement_id' not in buildings.columns:
        return None
    if files is None:
        files = (download_worldpop(iso, say=say) for iso in candidate_countries(bbox))
    result = reader(bbox, files)
    if result is None:
        return None
    cells, transform, path = result
    by_settlement = share_over_buildings(buildings, cells, transform)
    if not by_settlement:
        return None
    return {
        'source': 'WorldPop 2020, 100 m, constrained (R2025A)', 'file': Path(path).name, 'year': 2020,
        'method': 'Each 100 m cell\'s modelled people shared equally among the OpenStreetMap buildings in it',
        'people_in_mapped_buildings': round(sum(by_settlement.values())),
        'by_settlement': by_settlement,
    }


def pick_river_point(waterways, bbox):
    """A point on the longest mapped river in the area, as (lon, lat); the area's centre if none is mapped."""
    west, south, east, north = bbox
    centre = ((west + east) / 2, (south + north) / 2)
    if waterways is None or not len(waterways) or 'waterway' not in waterways.columns:
        return centre
    rivers = waterways[waterways['waterway'] == 'river']
    if not len(rivers):
        return centre
    metric = rivers.to_crs(rivers.estimate_utm_crs())
    longest = metric.geometry.iloc[int(np.argmax(metric.length.to_numpy()))]
    return lonlat(longest.interpolate(0.5, normalized=True), metric.crs)


def lonlat(point, crs):
    import geopandas as gpd
    p = gpd.GeoSeries([point], crs=crs).to_crs('EPSG:4326').iloc[0]
    return (float(p.x), float(p.y))


def fetch_discharge(lon, lat, end, get=None):
    """{date: m3/s} daily river discharge from 1984 to `end`, or None."""
    import requests
    get = get or requests.get
    try:
        response = get(FLOOD_API, params={'latitude': lat, 'longitude': lon, 'daily': 'river_discharge',
                                          'start_date': '1984-01-01', 'end_date': end.isoformat()}, timeout=60)
        response.raise_for_status()
        daily = response.json()['daily']
        return {t: v for t, v in zip(daily['time'], daily['river_discharge']) if v is not None}
    except Exception:
        return None


def river_ratio(series, event, window=SEASON_DAYS, after_days=7):
    """How the flow around the event compares with the same time of year in earlier years.

    series: {'YYYY-MM-DD': m3/s}. Returns None if there is too little history to call anything normal.
    """
    day = date.fromisoformat(event) if isinstance(event, str) else event
    on_event = series.get(day.isoformat())
    if on_event is None:
        return None
    normal, years = [], set()
    for iso, flow in series.items():
        d = date.fromisoformat(iso)
        if d.year >= day.year:
            continue
        try:
            same_day = day.replace(year=d.year)
        except ValueError:                      # 29 February
            same_day = day.replace(year=d.year, day=28)
        if abs((d - same_day).days) <= window:
            normal.append(flow)
            years.add(d.year)
    if len(years) < MIN_YEARS:
        return None
    median = float(np.median(normal))
    if median <= 0:
        return None
    after = [series[(day + timedelta(days=k)).isoformat()] for k in range(0, after_days + 1)
             if (day + timedelta(days=k)).isoformat() in series]
    return {
        'on_event_m3s': round(float(on_event), 2),
        'peak_m3s': round(float(max(after)), 2),
        'normal_m3s': round(median, 2),
        'ratio_on_event': round(float(on_event) / median, 2),
        'ratio_peak': round(float(max(after)) / median, 2),
        'years': len(years),
    }


def river_context(waterways, bbox, event, fetch=fetch_discharge):
    lon, lat = pick_river_point(waterways, bbox)
    day = date.fromisoformat(event)
    series = fetch(lon, lat, day + timedelta(days=10))
    if not series:
        return None
    ratio = river_ratio(series, day)
    if ratio is None:
        return None
    return {
        'source': 'Open-Meteo Flood API (GloFAS river discharge reanalysis)',
        'point': [round(lon, 4), round(lat, 4)], 'event': event, **ratio,
        'limits': 'About 5 km resolution: the cell may be a tributary, not the main river. The model is driven '
                  'by rain and snowmelt and cannot see a glacier collapse, a landslide dam or a lake outburst.',
    }


def build(bbox, event, buildings, waterways, say=print):
    """context.json content, or None when neither dataset could be had."""
    population = river = None
    try:
        population = population_context(bbox, buildings, say=say)
    except Exception as error:
        say(f'  Context: population not available ({type(error).__name__})')
    try:
        river = river_context(waterways, bbox, event)
    except Exception as error:
        say(f'  Context: river flow not available ({type(error).__name__})')
    if population is None and river is None:
        return None
    return {'note': 'Context shown beside the map. It is not an input to the flood, damage or cut-off results.',
            'population': population, 'river': river, 'attribution': ATTRIBUTION}


def write(out, context):
    path = Path(out) / 'context.json'
    if context is None:
        if path.exists():
            path.unlink()          # a rerun that found nothing must not leave an older run's context behind
        return None
    path.write_text(json.dumps(context, ensure_ascii=False, allow_nan=False, separators=(',', ':')), encoding='utf-8')
    return path
