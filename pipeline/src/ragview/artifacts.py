"""Build artifacts shared with the browser (web/public/data)."""

from __future__ import annotations

import hashlib
import json
import re
from dataclasses import dataclass

import numpy as np
import yaml

from .corpus import Document
from .generate import Claim, Evidence
from .paths import CURATED_FILE, WEB_DATA_DIR

CORPUS_NAME = "space-exploration"


@dataclass
class ChunkSet:
    """All chunks of the corpus for one (strategy, size, overlap) setting."""

    strategy: str
    size: int
    overlap: int
    doc: np.ndarray  # (n,) document index
    start: np.ndarray  # (n,) char offsets
    end: np.ndarray
    tokens: np.ndarray
    vectors: np.ndarray  # (n, 384) float32, unit norm (float16 precision)
    xy: np.ndarray  # (n, 2) float32 in [-1, 1]

    @property
    def id(self) -> str:
        return preset_id(self.strategy, self.size, self.overlap)

    def __len__(self) -> int:
        return len(self.doc)


def preset_id(strategy: str, size: int, overlap: int) -> str:
    return f"{strategy}-{size}-{overlap}"


def corpus_version(docs: list[Document]) -> str:
    h = hashlib.sha256()
    for d in docs:
        h.update(f"{d.id}\0{d.category}\0{d.text}\0".encode())
    return h.hexdigest()[:12]


def save_chunkset(cs: ChunkSet) -> dict:
    out = WEB_DATA_DIR / "presets"
    out.mkdir(parents=True, exist_ok=True)
    vec = cs.vectors.astype("<f2")
    (out / f"{cs.id}.f16").write_bytes(vec.tobytes())
    meta = {
        "id": cs.id,
        "strategy": cs.strategy,
        "chunk_size": cs.size,
        "overlap": cs.overlap,
        "n_chunks": len(cs),
        # Flat arrays keep the JSON small: [doc, start, end, tokens, doc, start, ...]
        "chunks": np.stack([cs.doc, cs.start, cs.end, cs.tokens], axis=1).ravel().tolist(),
        "xy": [round(float(v), 4) for v in cs.xy.ravel()],
    }
    (out / f"{cs.id}.json").write_text(json.dumps(meta, separators=(",", ":")))
    return {k: meta[k] for k in ("id", "strategy", "chunk_size", "overlap", "n_chunks")} | {
        "bytes": vec.nbytes
    }


def load_chunkset(pid: str) -> ChunkSet:
    d = WEB_DATA_DIR / "presets"
    meta = json.loads((d / f"{pid}.json").read_text())
    c = np.array(meta["chunks"], dtype=np.int64).reshape(-1, 4)
    vec = np.frombuffer((d / f"{pid}.f16").read_bytes(), dtype="<f2").reshape(len(c), -1)
    return ChunkSet(
        strategy=meta["strategy"],
        size=meta["chunk_size"],
        overlap=meta["overlap"],
        doc=c[:, 0],
        start=c[:, 1],
        end=c[:, 2],
        tokens=c[:, 3],
        vectors=vec.astype(np.float32),
        xy=np.array(meta["xy"], dtype=np.float32).reshape(-1, 2),
    )


def load_manifest() -> dict:
    return json.loads((WEB_DATA_DIR / "manifest.json").read_text())


def normalize_question(q: str) -> str:
    return re.sub(r"[\s?!.]+$", "", re.sub(r"\s+", " ", q.strip().lower()))


@dataclass(frozen=True)
class CuratedQuestion:
    id: str
    question: str
    featured: bool
    claims: list[Claim]
    no_rag: str
    no_rag_note: str


def load_curated(docs: list[Document]) -> tuple[list[CuratedQuestion], list[dict]]:
    """Parse curated.yaml and resolve every evidence quote to a character span."""
    raw = yaml.safe_load(CURATED_FILE.read_text())
    texts = {d.id: d.text for d in docs}
    questions = []
    for q in raw["questions"]:
        claims = []
        for c in q["claims"]:
            evidence = []
            for ev in c["evidence"]:
                text = texts.get(ev["doc"])
                if text is None:
                    raise ValueError(f"{q['id']}: unknown document {ev['doc']!r}")
                start = text.find(ev["quote"])
                if start < 0:
                    raise ValueError(f"{q['id']}: quote not found in {ev['doc']}: {ev['quote']!r}")
                evidence.append(Evidence(ev["doc"], start, start + len(ev["quote"])))
            claims.append(Claim(c["topic"], c["text"], evidence))
        questions.append(
            CuratedQuestion(
                id=q["id"],
                question=q["question"],
                featured=q.get("featured", False),
                claims=claims,
                no_rag=q["no_rag"].strip(),
                no_rag_note=q["no_rag_note"],
            )
        )
    ids = {q.id for q in questions}
    for fc in raw["failure_cases"]:
        if fc["question"] not in ids:
            raise ValueError(f"failure case {fc['id']}: unknown question {fc['question']!r}")
    return questions, raw["failure_cases"]


def curated_to_json(questions: list[CuratedQuestion], failure_cases: list[dict]) -> dict:
    return {
        "questions": [
            {
                "id": q.id,
                "question": q.question,
                "featured": q.featured,
                "no_rag": q.no_rag,
                "no_rag_note": q.no_rag_note,
                "claims": [
                    {
                        "topic": c.topic,
                        "text": c.text,
                        "evidence": [
                            {"doc": e.doc, "start": e.start, "end": e.end} for e in c.evidence
                        ],
                    }
                    for c in q.claims
                ],
            }
            for q in questions
        ],
        "failure_cases": failure_cases,
    }
