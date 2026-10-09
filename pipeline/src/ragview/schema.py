"""Pipeline trace schema: the contract between the engines and the visualizer.

A trace is the full record of one question going through the RAG pipeline:
one typed event per phase. Both engines (this Python reference and the
browser engine) emit it, and the player animates nothing that is not in it.

`uv run ragview schema` exports JSON Schema; the web app generates its
TypeScript types from that file (`npm run gen:types`).
"""

from __future__ import annotations

from typing import Annotated, Literal

from pydantic import BaseModel, ConfigDict, Field

SCHEMA_VERSION = "1"

Strategy = Literal["sentence", "fixed"]


class Model(BaseModel):
    model_config = ConfigDict(extra="forbid", json_schema_serialization_defaults_required=True)


class Params(Model):
    """User-controllable pipeline parameters."""

    chunk_size: int = Field(256, ge=16, le=512, description="Max tokens per chunk")
    overlap: int = Field(38, ge=0, le=256, description="Max tokens shared by neighbouring chunks")
    strategy: Strategy = "sentence"
    top_k: int = Field(5, ge=1, le=20)
    threshold: float = Field(0.6, ge=0, le=1, description="Minimum cosine similarity")
    rerank: bool = False
    rerank_pool: int = Field(20, ge=1, le=50, description="Candidates given to the reranker")


class Point(Model):
    x: float
    y: float


class ChunkSpan(Model):
    start: int = Field(description="Character offset in the document text (inclusive)")
    end: int = Field(description="Character offset in the document text (exclusive)")
    tokens: int


class EventBase(Model):
    duration_ms: float = Field(description="Wall-clock time spent computing this phase")


class ChunkingEvent(EventBase):
    phase: Literal["chunking"] = "chunking"
    preset: str = Field(description="Chunk-set id, e.g. 'sentence-256-38'")
    precomputed: bool = Field(description="Loaded from build artifacts rather than computed now")
    strategy: Strategy
    chunk_size: int
    overlap: int
    n_docs: int
    n_chunks: int
    avg_tokens: float
    focus_doc: str = Field(description="Document shown in the chunking view")
    focus_chunks: list[ChunkSpan]


class VectorSample(Model):
    chunk: int
    preview: list[float] = Field(description="First dimensions of the vector")


class EmbeddingEvent(EventBase):
    phase: Literal["embedding"] = "embedding"
    precomputed: bool
    model: str
    dim: int
    pooling: Literal["cls", "mean"]
    normalized: bool
    n_vectors: int
    samples: list[VectorSample]


class ProjectionInfo(Model):
    method: Literal["umap"] = "umap"
    n_neighbors: int
    min_dist: float
    metric: Literal["cosine"] = "cosine"
    fitted_on: str = Field(description="Preset the UMAP model was fitted on")


class IndexingEvent(EventBase):
    phase: Literal["indexing"] = "indexing"
    index: Literal["exact-cosine"] = "exact-cosine"
    n_vectors: int
    dim: int
    bytes: int
    projection: ProjectionInfo


class QueryEvent(EventBase):
    phase: Literal["query"] = "query"
    text: str
    tokens: list[str] = Field(description="WordPiece tokens fed to the embedding model")
    preview: list[float]
    position: Point
    projection_neighbors: list[int] = Field(description="Chunks used to place the query in 2D")


class Candidate(Model):
    chunk: int
    doc: str
    score: float = Field(description="Cosine similarity to the query")
    rank: int
    above_threshold: bool


class RetrievalEvent(EventBase):
    phase: Literal["retrieval"] = "retrieval"
    metric: Literal["cosine"] = "cosine"
    top_k: int
    threshold: float
    n_scanned: int
    candidates: list[Candidate]
    selected: list[int] = Field(description="Chunks passed on (top-k above threshold)")


class RerankItem(Model):
    chunk: int
    retrieval_rank: int
    rerank_rank: int
    retrieval_score: float
    rerank_score: float = Field(description="Cross-encoder logit")
    relevance: float = Field(description="sigmoid(rerank_score)")


class RerankEvent(EventBase):
    phase: Literal["rerank"] = "rerank"
    enabled: bool
    model: str | None
    items: list[RerankItem]
    selected: list[int]


class PromptChunk(Model):
    n: int = Field(description="1-based source number used in citations")
    chunk: int
    doc: str
    title: str
    tokens: int


class TokenCounts(Model):
    system: int
    context: int
    question: int
    total: int


class PromptEvent(EventBase):
    phase: Literal["prompt"] = "prompt"
    template: str
    context: list[PromptChunk]
    text: str
    token_counts: TokenCounts
    tokenizer: str
    approximate: bool = Field(True, description="Counts use the embedding tokenizer")


class AnswerToken(Model):
    text: str
    cite: int | None = Field(None, description="Citation marker: source number")


class Citation(Model):
    n: int
    chunk: int
    doc: str
    start: int = Field(description="Evidence span in the document")
    end: int


class NoRagAnswer(Model):
    text: str
    illustrative: bool = Field(description="Hand-written illustration, not model output")


class GenerationEvent(EventBase):
    phase: Literal["generation"] = "generation"
    generator: Literal["scripted", "extractive"]
    simulated: bool = True
    status: Literal["answered", "partial", "refused"]
    tokens: list[AnswerToken]
    citations: list[Citation]
    missing: list[str] = Field(description="Topics the retrieved context did not cover")
    no_rag: NoRagAnswer | None


Event = Annotated[
    ChunkingEvent
    | EmbeddingEvent
    | IndexingEvent
    | QueryEvent
    | RetrievalEvent
    | RerankEvent
    | PromptEvent
    | GenerationEvent,
    Field(discriminator="phase"),
]


class CorpusRef(Model):
    name: str
    version: str = Field(description="Content hash of the corpus")
    n_docs: int


class Trace(Model):
    schema_version: Literal["1"] = SCHEMA_VERSION
    id: str = Field(description="Deterministic hash of question, params and corpus")
    created_at: str
    source: Literal["live", "replay"]
    engine: Literal["python", "browser"]
    corpus: CorpusRef
    question: str
    params: Params
    events: list[Event]


def trace_json_schema() -> dict:
    """JSON Schema for Trace, without per-property titles.

    Property titles make code generators emit one alias type per field
    (Strategy1, ChunkSize1, ...); dropping them keeps the TypeScript clean.
    """
    schema = Trace.model_json_schema(mode="serialization")
    for model in [schema, *schema.get("$defs", {}).values()]:
        for prop in model.get("properties", {}).values():
            prop.pop("title", None)
    return schema
