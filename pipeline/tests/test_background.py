import sys
from pathlib import Path

import pytest

sys.path.insert(0, str(Path(__file__).parent.parent))

import run  # noqa: E402


def test_the_result_arrives_when_asked_for():
    result = run.in_background(lambda a, b: a + b, 2, 3)
    assert result() == 5


def test_an_error_in_the_background_is_raised_where_the_result_is_asked_for():
    def busy():
        raise RuntimeError('Overpass did not answer')

    result = run.in_background(busy)
    with pytest.raises(RuntimeError, match='did not answer'):
        result()
