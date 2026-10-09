"""Repository paths. Override the root with RAGVIEW_ROOT (e.g. inside Docker)."""

import os
from pathlib import Path

ROOT = Path(os.environ.get("RAGVIEW_ROOT", Path(__file__).resolve().parents[3]))
CORPUS_DIR = ROOT / "corpus"
DOCS_DIR = CORPUS_DIR / "docs"
SOURCES_FILE = CORPUS_DIR / "sources.yaml"
LOCK_FILE = CORPUS_DIR / "corpus.lock.json"
CURATED_FILE = CORPUS_DIR / "curated.yaml"
EVAL_DIR = ROOT / "eval"
FIXTURES_DIR = ROOT / "shared" / "fixtures"
WEB_DATA_DIR = ROOT / "web" / "public" / "data"
SCHEMA_DIR = ROOT / "shared" / "schema"
