import pytest

from ragview.artifacts import load_curated
from ragview.corpus import load_corpus
from ragview.paths import WEB_DATA_DIR


@pytest.fixture(scope="session")
def docs():
    return load_corpus()


@pytest.fixture(scope="session")
def curated(docs):
    return load_curated(docs)


@pytest.fixture(scope="session")
def built():
    if not (WEB_DATA_DIR / "manifest.json").exists():
        pytest.skip("artifacts missing: run `uv run ragview build`")
    return WEB_DATA_DIR
