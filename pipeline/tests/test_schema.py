import json

import pytest
from pydantic import TypeAdapter, ValidationError

from ragview.paths import SCHEMA_DIR
from ragview.schema import Event, Trace, trace_json_schema

PHASES = [
    "chunking",
    "embedding",
    "indexing",
    "query",
    "retrieval",
    "rerank",
    "prompt",
    "generation",
]


def test_exported_json_schema_is_up_to_date():
    on_disk = json.loads((SCHEMA_DIR / "trace.schema.json").read_text())
    assert on_disk == trace_json_schema(), "run `uv run ragview schema`"


def test_recorded_traces_validate_and_have_every_phase(built):
    files = sorted((built / "traces").glob("*.json"))
    assert files
    for f in files:
        trace = Trace.model_validate_json(f.read_text())
        assert [e.phase for e in trace.events] == PHASES, f.name


def test_events_are_discriminated_by_phase():
    adapter = TypeAdapter(Event)
    ev = adapter.validate_python(
        {
            "phase": "rerank",
            "duration_ms": 1,
            "enabled": False,
            "model": None,
            "items": [],
            "selected": [],
        }
    )
    assert type(ev).__name__ == "RerankEvent"
    with pytest.raises(ValidationError):
        adapter.validate_python({"phase": "rerank", "duration_ms": 1})
    with pytest.raises(ValidationError):
        adapter.validate_python({"phase": "teleport", "duration_ms": 1})


def test_unknown_fields_are_rejected(built):
    raw = json.loads(next((built / "traces").glob("*.json")).read_text())
    raw["events"][0]["surprise"] = True
    with pytest.raises(ValidationError):
        Trace.model_validate(raw)
