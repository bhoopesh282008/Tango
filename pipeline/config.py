"""Thresholds and constants shared by the pipeline."""
import os
from pathlib import Path

ROOT = Path(__file__).parent
CACHE = ROOT / 'cache'
OUT = ROOT / 'out'

# Copernicus Data Space credentials come from the environment, never the repo.
CDSE_USER = os.environ.get('CDSE_USER')
CDSE_PASSWORD = os.environ.get('CDSE_PASSWORD')

OHSOME_URL = 'https://api.ohsome.org/v1'
# Latest pre-event snapshot allowed by the brief (event: 26 Aug 2026).
OSM_SNAPSHOT = '2026-07-27'

# Sentinel-1 backscatter thresholds, dB (VV).
WATER_MAX_DB = -18.0       # open water is a specular reflector
WATER_DROP_DB = -3.0       # post - pre must fall by at least this
DEBRIS_RISE_DB = 3.0       # rough mud/rock raises backscatter
UNCERTAIN_FRACTION = 0.6   # weaker change still counts, flagged uncertain
MAX_SLOPE_DEG = 20.0       # steep slopes: shadow/layover, not water
MIN_ZONE_M2 = 2000         # drop speckle-sized polygons
# With a valley-floor mask (terrain.py): change on the floor is flood; elsewhere only
# strong, large change is kept, as 'uncertain' (it may be a landslide or debris flow).
SLOPE_CHANGE_DB = 4.5
SLOPE_MIN_PIXELS = 100     # 1 ha at 10 m

CLASS_NONE, CLASS_WATER, CLASS_DEBRIS, CLASS_UNCERTAIN = 0, 1, 2, 3
CLASS_NAMES = {CLASS_WATER: 'water', CLASS_DEBRIS: 'debris', CLASS_UNCERTAIN: 'uncertain'}

ATTRIBUTION = [
    'Contains modified Copernicus Sentinel data 2026.',
    'Produced using Copernicus WorldDEM-30 © DLR e.V. 2010-2014 and © Airbus Defence and '
    'Space GmbH 2014-2018 provided under COPERNICUS by the European Union and ESA; all rights reserved.',
    '© OpenStreetMap contributors.',
    'Flood model trained on Kuro Siwo (Bountos et al., NeurIPS 2024), CC BY 4.0.',
]
