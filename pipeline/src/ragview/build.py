"""Build every artifact the web app needs from the committed corpus."""

from __future__ import annotations

import hashlib
import json
import time

import numpy as np

from . import projection
from .artifacts import (
    CORPUS_NAME,
    ChunkSet,
    corpus_version,
    curated_to_json,
    load_curated,
    preset_id,
    save_chunkset,
)
from .chunking import chunk_text, split_sentences
from .corpus import Document, load_categories, load_corpus
from .embedding import embed
from .engine import Context, run
from .models import EMBED_MODEL, MAX_LENGTH, ONNX_FILE, RERANK_MODEL, count_tokens
from .paths import FIXTURES_DIR, ROOT, SCHEMA_DIR, WEB_DATA_DIR
from .schema import Params, trace_json_schema

SIZES = (48, 128, 256, 448)
OVERLAP_PCT = (0, 15, 30)
REFERENCE = ("sentence", 256, 38)  # UMAP is fitted on this preset (the default)
EXTRA_PRESETS = (("fixed", 256, 38),)


def preset_specs() -> list[tuple[str, int, int]]:
    specs = [("sentence", s, round(s * p / 100)) for s in SIZES for p in OVERLAP_PCT]
    return specs + list(EXTRA_PRESETS)


class EmbeddingCache:
    """Disk cache of chunk embeddings keyed by text hash (rebuilds take seconds)."""

    def __init__(self) -> None:
        self.path = ROOT / "pipeline" / ".cache" / "embeddings.npz"
        self.store: dict[str, np.ndarray] = {}
        if self.path.exists():
            data = np.load(self.path)
            self.store = dict(zip(data["keys"].tolist(), data["vectors"], strict=True))

    def __call__(self, texts: list[str]) -> np.ndarray:
        keys = [hashlib.sha1(f"{EMBED_MODEL}\0{t}".encode()).hexdigest() for t in texts]
        todo = sorted(
            {k: t for k, t in zip(keys, texts, strict=True) if k not in self.store}.items()
        )
        if todo:
            for (k, _), v in zip(todo, embed([t for _, t in todo]), strict=True):
                self.store[k] = v
        return np.stack([self.store[k] for k in keys])

    def save(self) -> None:
        self.path.parent.mkdir(parents=True, exist_ok=True)
        keys = list(self.store)
        np.savez(self.path, keys=np.array(keys), vectors=np.stack([self.store[k] for k in keys]))


def chunk_corpus(docs: list[Document], strategy: str, size: int, overlap: int) -> np.ndarray:
    rows = []
    for di, d in enumerate(docs):
        for s in chunk_text(d.text, size, overlap, strategy, count_tokens):  # type: ignore[arg-type]
            rows.append((di, s.start, s.end, s.tokens))
    return np.array(rows, dtype=np.int64)


def make_chunkset(
    docs: list[Document], spec: tuple[str, int, int], embed_fn, place_on: ChunkSet | None = None
) -> ChunkSet:
    """Chunk + embed; if `place_on` is given, position chunks out-of-sample against it."""
    strategy, size, overlap = spec
    rows = chunk_corpus(docs, strategy, size, overlap)
    texts = [docs[d].text[s:e] for d, s, e, _ in rows]
    # Round-trip through float16 so every engine sees exactly the stored vectors.
    vectors = embed_fn(texts).astype("<f2").astype(np.float32)
    xy = np.zeros((len(rows), 2), dtype=np.float32)
    if place_on is not None:
        xy = np.stack([projection.place(v, place_on.vectors, place_on.xy)[0] for v in vectors])
    return ChunkSet(
        strategy, size, overlap, rows[:, 0], rows[:, 1], rows[:, 2], rows[:, 3], vectors, xy
    )


def export_schema() -> None:
    SCHEMA_DIR.mkdir(parents=True, exist_ok=True)
    schema = trace_json_schema()
    (SCHEMA_DIR / "trace.schema.json").write_text(json.dumps(schema, indent=2) + "\n")


def build() -> None:
    t0 = time.perf_counter()
    docs = load_corpus()
    version = corpus_version(docs)
    curated, failure_cases = load_curated(docs)
    cache = EmbeddingCache()
    WEB_DATA_DIR.mkdir(parents=True, exist_ok=True)
    print(f"corpus {CORPUS_NAME}@{version}: {len(docs)} documents")

    sets: dict[str, ChunkSet] = {}
    for spec in preset_specs():
        sets[preset_id(*spec)] = make_chunkset(docs, spec, cache)
        print(
            f"  chunked + embedded {preset_id(*spec):<18} {len(sets[preset_id(*spec)]):>5} chunks"
        )
    cache.save()

    ref = sets[preset_id(*REFERENCE)]
    proj, ref.xy = projection.fit(ref.vectors)
    for _pid, cs in sets.items():
        if cs is not ref:
            cs.xy = projection.transform(proj, cs.vectors)
    print(f"  UMAP fitted on {ref.id}, transformed {len(sets) - 1} presets")
    presets = [save_chunkset(cs) for cs in sets.values()]

    (WEB_DATA_DIR / "corpus.json").write_text(
        json.dumps(
            {
                "name": CORPUS_NAME,
                "version": version,
                "categories": load_categories(),
                "docs": [
                    {
                        "id": d.id,
                        "title": d.title,
                        "url": d.url,
                        "category": d.category,
                        "text": d.text,
                    }
                    for d in docs
                ],
            },
            ensure_ascii=False,
        )
    )
    # WordPiece counts per corpus word: lets the browser re-chunk instantly
    # (token counts are additive over whitespace-separated words).
    vocab = sorted({w for d in docs for w in d.text.split()})
    (WEB_DATA_DIR / "word-tokens.json").write_text(
        json.dumps({w: count_tokens(w) for w in vocab}, ensure_ascii=False, separators=(",", ":"))
    )
    (WEB_DATA_DIR / "curated.json").write_text(
        json.dumps(curated_to_json(curated, failure_cases), ensure_ascii=False, indent=1)
    )

    # Recorded traces: the landing page replays these before any model is downloaded.
    ctx = Context(docs, version, curated, ref.id, embed=cache)
    traces = []
    jobs = [(f"q-{q.id}", q.question, {}) for q in curated] + [
        (
            f"fc-{fc['id']}",
            next(q.question for q in curated if q.id == fc["question"]),
            fc["params"],
        )
        for fc in failure_cases
    ]
    (WEB_DATA_DIR / "traces").mkdir(exist_ok=True)
    for name, question, overrides in jobs:
        params = Params(**overrides)
        spec = (params.strategy, params.chunk_size, params.overlap)
        cs = sets.get(preset_id(*spec)) or make_chunkset(docs, spec, cache, place_on=ref)
        trace = run(question, params, cs, ctx, source="replay")
        (WEB_DATA_DIR / "traces" / f"{name}.json").write_text(trace.model_dump_json())
        gen = trace.events[-1]
        traces.append(
            {
                "id": name,
                "trace_id": trace.id,
                "question": question,
                "params": overrides,
                "file": f"traces/{name}.json",
            }
        )
        print(f"  trace {name:<26} {gen.status:<9} missing={gen.missing}")  # type: ignore[union-attr]
    cache.save()

    manifest = {
        "schema_version": "1",
        "corpus": {"name": CORPUS_NAME, "version": version, "n_docs": len(docs)},
        "models": {
            "embed": {
                "id": EMBED_MODEL,
                "dim": 384,
                "pooling": "cls",
                "file": ONNX_FILE,
                "max_length": MAX_LENGTH,
            },
            "rerank": {"id": RERANK_MODEL, "file": ONNX_FILE},
        },
        "projection": {
            "method": "umap",
            "n_neighbors": projection.N_NEIGHBORS,
            "min_dist": projection.MIN_DIST,
            "fitted_on": ref.id,
        },
        "defaults": Params().model_dump(),
        "sizes": list(SIZES),
        "overlap_pct": list(OVERLAP_PCT),
        "presets": presets,
        "traces": traces,
    }
    (WEB_DATA_DIR / "manifest.json").write_text(json.dumps(manifest, indent=1))
    export_schema()
    write_fixtures(docs, sets, ctx)
    print(f"done in {time.perf_counter() - t0:.1f}s -> {WEB_DATA_DIR.relative_to(ROOT)}")


def write_fixtures(docs: list[Document], sets: dict[str, ChunkSet], ctx: Context) -> None:
    """Fixtures that pin down Python <-> TypeScript parity."""
    FIXTURES_DIR.mkdir(parents=True, exist_ok=True)
    picks = ["voyager-1", "apollo-13", "margaret-hamilton-software-engineer", "wernher-von-braun"]
    by_id = {d.id: d for d in docs}
    configs = [
        ("sentence", 48, 0),
        ("sentence", 128, 19),
        ("sentence", 256, 38),
        ("sentence", 100, 50),
        ("fixed", 64, 16),
    ]
    chunking = {
        "sentences": {p: split_sentences(by_id[p].text) for p in picks},
        "chunks": [
            {
                "doc": p,
                "strategy": st,
                "size": sz,
                "overlap": ov,
                "spans": [
                    [s.start, s.end, s.tokens]
                    for s in chunk_text(by_id[p].text, sz, ov, st, count_tokens)
                ],
            }
            for p in picks
            for st, sz, ov in configs
        ],
    }
    (FIXTURES_DIR / "chunking.json").write_text(json.dumps(chunking))

    texts = [
        "Voyager 1 crossed the heliopause in 2012.",
        "What did Margaret Hamilton contribute to the Apollo program?",
        "Titan is Saturn's largest moon, with a thick nitrogen atmosphere.",
        "Ünïcode, punctuation — and numbers: 3.14!",
    ]
    vecs = embed(texts)
    words = sorted(
        {w for t in texts for w in t.split()} | {"heliopause", "interstellar", "Korolev's"}
    )
    (FIXTURES_DIR / "embedding.json").write_text(
        json.dumps(
            {
                "model": EMBED_MODEL,
                "texts": texts,
                "vectors": [[round(float(x), 6) for x in v] for v in vecs],
                "word_tokens": {w: count_tokens(w) for w in words},
            }
        )
    )

    ref = sets[ctx.reference_preset]
    queries = [
        "When did Voyager 1 enter interstellar space?",
        "rocket engines burning kerosene",
        "pizza",
    ]
    qv = [embed([q])[0] for q in queries]  # one at a time, like the engine
    retrieval = {
        "preset": ref.id,
        "queries": [
            {
                "text": q,
                "top": [int(i) for i in np.lexsort((np.arange(len(ref)), -(ref.vectors @ v)))[:10]],
                "position": [
                    round(float(c), 4) for c in projection.place(v, ref.vectors, ref.xy)[0]
                ],
            }
            for q, v in zip(queries, qv, strict=True)
        ],
    }
    (FIXTURES_DIR / "retrieval.json").write_text(json.dumps(retrieval, indent=1))
