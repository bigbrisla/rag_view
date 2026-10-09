"""Reference RAG engine: runs one question through the pipeline and emits a Trace.

`web/src/engine/pipeline.ts` mirrors this module; both emit the same schema.
"""

from __future__ import annotations

import hashlib
import json
import time
from collections.abc import Callable
from dataclasses import dataclass
from datetime import UTC, datetime

import numpy as np

from . import generate, projection
from .artifacts import CORPUS_NAME, ChunkSet, CuratedQuestion, normalize_question
from .corpus import Document
from .embedding import DIM, embed
from .models import EMBED_MODEL, RERANK_MODEL, tokenizer
from .prompt import TEMPLATE_ID, Source, build_prompt
from .rerank import rerank_scores, sigmoid
from .retrieval import search
from .schema import (
    Candidate,
    ChunkingEvent,
    ChunkSpan,
    CorpusRef,
    EmbeddingEvent,
    GenerationEvent,
    IndexingEvent,
    NoRagAnswer,
    Params,
    Point,
    ProjectionInfo,
    PromptChunk,
    PromptEvent,
    QueryEvent,
    RerankEvent,
    RerankItem,
    RetrievalEvent,
    TokenCounts,
    Trace,
    VectorSample,
)

PREVIEW_DIMS = 16


@dataclass
class Context:
    """Everything the engine needs besides the question."""

    docs: list[Document]
    corpus_version: str
    curated: list[CuratedQuestion]
    reference_preset: str
    embed: Callable[[list[str]], np.ndarray] = embed


def trace_id(question: str, params: Params, version: str) -> str:
    key = json.dumps([question, params.model_dump(), version], sort_keys=True)
    return hashlib.sha256(key.encode()).hexdigest()[:16]


def _r(x: float, nd: int = 4) -> float:
    return round(float(x), nd)


def run(
    question: str,
    params: Params,
    chunks: ChunkSet,
    ctx: Context,
    *,
    precomputed: bool = True,
    source: str = "live",
) -> Trace:
    docs = ctx.docs
    texts = {d.id: d.text for d in docs}
    clock = time.perf_counter

    # 4. Query embedding and 2D placement (computed first: later phases depend on it).
    t = clock()
    qvec = ctx.embed([question])[0]
    position, neighbors = projection.place(qvec, chunks.vectors, chunks.xy)
    query_ms = (clock() - t) * 1000

    # 5. Retrieval: exact cosine over every chunk.
    t = clock()
    pool = max(params.top_k, params.rerank_pool) if params.rerank else params.top_k
    idx, scores = search(chunks.vectors, qvec, pool)
    candidates = [
        Candidate(
            chunk=int(i),
            doc=docs[chunks.doc[i]].id,
            score=_r(s),
            rank=r + 1,
            above_threshold=bool(s >= params.threshold),
        )
        for r, (i, s) in enumerate(zip(idx, scores, strict=True))
    ]
    passing = [c.chunk for c in candidates if c.above_threshold]
    selected = (
        passing
        if params.rerank
        else [c.chunk for c in candidates[: params.top_k] if c.above_threshold]
    )
    retrieval_ms = (clock() - t) * 1000

    # 6. Optional cross-encoder reranking of the passing candidates.
    t = clock()
    rerank_items: list[RerankItem] = []
    final = selected
    if params.rerank and selected:
        raw = rerank_scores(question, [_chunk_text(chunks, i, docs) for i in selected])
        order = np.lexsort((np.arange(len(raw)), -raw))
        rank_of = {int(o): r + 1 for r, o in enumerate(order)}
        by_chunk = {c.chunk: c for c in candidates}
        rerank_items = [
            RerankItem(
                chunk=ch,
                retrieval_rank=by_chunk[ch].rank,
                rerank_rank=rank_of[j],
                retrieval_score=by_chunk[ch].score,
                rerank_score=_r(raw[j]),
                relevance=_r(sigmoid(raw[j])),
            )
            for j, ch in enumerate(selected)
        ]
        final = [selected[int(o)] for o in order[: params.top_k]]
    rerank_ms = (clock() - t) * 1000

    # 7. Prompt assembly.
    t = clock()
    context = [
        generate.ContextChunk(
            n=n,
            chunk=ch,
            doc=docs[chunks.doc[ch]].id,
            start=int(chunks.start[ch]),
            end=int(chunks.end[ch]),
        )
        for n, ch in enumerate(final, start=1)
    ]
    sources = [
        Source(c.n, docs[chunks.doc[c.chunk]].title, _chunk_text(chunks, c.chunk, docs))
        for c in context
    ]
    prompt_text, counts = build_prompt(question, sources)
    prompt_ms = (clock() - t) * 1000

    # 8. Simulated generation.
    t = clock()
    curated = _find_curated(question, ctx.curated)
    if curated is not None:
        answer = generate.scripted(curated.claims, context)
        generator = "scripted"
        no_rag = NoRagAnswer(text=curated.no_rag, illustrative=True)
    else:
        answer = generate.extractive(qvec, context, texts, ctx.embed, params.threshold)
        generator, no_rag = "extractive", None
    generation_ms = (clock() - t) * 1000

    # 1. Chunking view focuses on the document holding the best match.
    focus = int(chunks.doc[final[0] if final else idx[0]])
    in_doc = np.flatnonzero(chunks.doc == focus)

    events = [
        ChunkingEvent(
            duration_ms=0,
            preset=chunks.id,
            precomputed=precomputed,
            strategy=chunks.strategy,
            chunk_size=chunks.size,
            overlap=chunks.overlap,
            n_docs=len(docs),
            n_chunks=len(chunks),
            avg_tokens=_r(chunks.tokens.mean(), 1),
            focus_doc=docs[focus].id,
            focus_chunks=[
                ChunkSpan(
                    start=int(chunks.start[i]), end=int(chunks.end[i]), tokens=int(chunks.tokens[i])
                )
                for i in in_doc
            ],
        ),
        EmbeddingEvent(
            duration_ms=0,
            precomputed=precomputed,
            model=EMBED_MODEL,
            dim=DIM,
            pooling="cls",
            normalized=True,
            n_vectors=len(chunks),
            samples=[
                VectorSample(
                    chunk=int(i), preview=[_r(v) for v in chunks.vectors[i, :PREVIEW_DIMS]]
                )
                for i in (final or [int(idx[0])])
            ],
        ),
        IndexingEvent(
            duration_ms=0,
            n_vectors=len(chunks),
            dim=DIM,
            bytes=len(chunks) * DIM * 2,
            projection=ProjectionInfo(
                n_neighbors=projection.N_NEIGHBORS,
                min_dist=projection.MIN_DIST,
                fitted_on=ctx.reference_preset,
            ),
        ),
        QueryEvent(
            duration_ms=_r(query_ms, 2),
            text=question,
            tokens=tokenizer().encode(question).tokens,
            preview=[_r(v) for v in qvec[:PREVIEW_DIMS]],
            position=Point(x=_r(position[0]), y=_r(position[1])),
            projection_neighbors=[int(i) for i in neighbors],
        ),
        RetrievalEvent(
            duration_ms=_r(retrieval_ms, 2),
            top_k=params.top_k,
            threshold=params.threshold,
            n_scanned=len(chunks),
            candidates=candidates,
            selected=selected,
        ),
        RerankEvent(
            duration_ms=_r(rerank_ms, 2),
            enabled=params.rerank,
            model=RERANK_MODEL if params.rerank else None,
            items=rerank_items,
            selected=final,
        ),
        PromptEvent(
            duration_ms=_r(prompt_ms, 2),
            template=TEMPLATE_ID,
            context=[
                PromptChunk(
                    n=c.n,
                    chunk=c.chunk,
                    doc=c.doc,
                    title=s.title,
                    tokens=int(chunks.tokens[c.chunk]),
                )
                for c, s in zip(context, sources, strict=True)
            ],
            text=prompt_text,
            token_counts=TokenCounts(**counts),
            tokenizer=EMBED_MODEL,
        ),
        GenerationEvent(
            duration_ms=_r(generation_ms, 2),
            generator=generator,
            status=answer.status,
            tokens=answer.tokens,
            citations=answer.citations,
            missing=answer.missing,
            no_rag=no_rag,
        ),
    ]
    return Trace(
        id=trace_id(question, params, ctx.corpus_version),
        created_at=datetime.now(UTC).isoformat(timespec="seconds"),
        source=source,
        engine="python",
        corpus=CorpusRef(name=CORPUS_NAME, version=ctx.corpus_version, n_docs=len(docs)),
        question=question,
        params=params,
        events=events,
    )


def _chunk_text(chunks: ChunkSet, i: int, docs: list[Document]) -> str:
    return docs[chunks.doc[i]].text[chunks.start[i] : chunks.end[i]]


def _find_curated(question: str, curated: list[CuratedQuestion]) -> CuratedQuestion | None:
    key = normalize_question(question)
    return next((q for q in curated if normalize_question(q.question) == key), None)
