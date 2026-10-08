"""The pipeline's modules import each other by bare name (`import config`), so the pipeline folder has
to be on the path whichever folder pytest is started from. CI starts it at the repository root, a
person usually inside pipeline/; without this the tests found only when started from inside."""
import sys
from pathlib import Path

PIPELINE = str(Path(__file__).resolve().parent.parent)
if PIPELINE not in sys.path:
    sys.path.insert(0, PIPELINE)
