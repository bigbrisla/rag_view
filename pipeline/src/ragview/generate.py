"""Simulated generation.

RAGView does not call an LLM. Two generators produce answers from the
retrieved context instead, and both react to retrieval quality for real:

- ScriptedGenerator (curated questions): a hand-written answer split into
  claims; a claim is stated only if all of its evidence spans are covered by
  the chunks in the prompt.
- ExtractiveGenerator (any other question): quotes the retrieved sentences
  most similar to the question.

`web/src/engine/generators/` mirrors this module. A real LLM can be plugged in
behind the same interface: (question, context) -> tokens + citations.
"""

from __future__ import annotations

from collections.abc import Callable
from dataclasses import dataclass, field

import numpy as np

from .chunking import split_sentences
from .schema import AnswerToken, Citation

REFUSAL = "I couldn't find the answer in the retrieved sources, so I won't guess."
EXTRACTIVE_LEAD = "According to the sources:"
MAX_EXTRACTED = 3


@dataclass(frozen=True)
class ContextChunk:
    n: int
    chunk: int
    doc: str
    start: int
    end: int


@dataclass(frozen=True)
class Evidence:
    doc: str
    start: int
    end: int


@dataclass(frozen=True)
class Claim:
    topic: str
    text: str
    evidence: list[Evidence]


@dataclass
class Answer:
    status: str
    tokens: list[AnswerToken] = field(default_factory=list)
    citations: list[Citation] = field(default_factory=list)
    missing: list[str] = field(default_factory=list)


def sentence_tokens(text: str, cites: list[int], first: bool) -> list[AnswerToken]:
    """Split a sentence into word tokens; citation markers go before the final period."""
    words = text.split(" ")
    tail = ""
    if cites and words[-1] and words[-1][-1] in ".!?":
        words[-1], tail = words[-1][:-1], words[-1][-1]
    tokens = [AnswerToken(text=w if first and i == 0 else " " + w) for i, w in enumerate(words)]
    tokens += [AnswerToken(text="", cite=n) for n in cites]
    if tail:
        tokens.append(AnswerToken(text=tail))
    return tokens


def covering_chunks(ev: Evidence, context: list[ContextChunk]) -> list[ContextChunk] | None:
    """Context chunks overlapping the evidence span, or None if they don't cover all of it."""
    hits = sorted(
        (c for c in context if c.doc == ev.doc and c.start < ev.end and c.end > ev.start),
        key=lambda c: (c.start, c.n),
    )
    reach = ev.start
    for c in hits:
        if c.start > reach:
            break
        reach = max(reach, c.end)
    return hits if reach >= ev.end else None


def scripted(claims: list[Claim], context: list[ContextChunk]) -> Answer:
    ans = Answer(status="answered")
    for claim in claims:
        cites: list[Citation] = []
        for ev in claim.evidence:
            hits = covering_chunks(ev, context)
            if hits is None:
                cites = []
                break
            cites += [
                Citation(
                    n=c.n,
                    chunk=c.chunk,
                    doc=c.doc,
                    start=max(ev.start, c.start),
                    end=min(ev.end, c.end),
                )
                for c in hits
            ]
        if not cites:
            ans.missing.append(claim.topic)
            continue
        numbers = sorted({c.n for c in cites})
        ans.tokens += sentence_tokens(claim.text, numbers, first=not ans.tokens)
        ans.citations += cites
    if not ans.tokens:
        return refusal(missing=ans.missing)
    if ans.missing:
        ans.status = "partial"
        gap = f"The retrieved sources don't cover {' or '.join(ans.missing)}."
        ans.tokens += sentence_tokens(gap, [], first=False)
    return ans


def extractive(
    query_vec: np.ndarray,
    context: list[ContextChunk],
    texts: dict[str, str],
    embed: Callable[[list[str]], np.ndarray],
    threshold: float,
) -> Answer:
    """Quote the context sentences most similar to the question."""
    spans: list[tuple[ContextChunk, int, int]] = []
    seen: set[tuple[str, int, int]] = set()
    for c in context:
        inside = [
            (s, e) for s, e in split_sentences(texts[c.doc]) if s >= c.start and e <= c.end
        ] or [(c.start, c.end)]
        for s, e in inside:
            if (c.doc, s, e) not in seen:
                seen.add((c.doc, s, e))
                spans.append((c, s, e))
    if not spans:
        return refusal()
    scores = embed([texts[c.doc][s:e] for c, s, e in spans]) @ query_vec
    order = [int(i) for i in np.lexsort((np.arange(len(scores)), -scores))]
    picked = [i for i in order if scores[i] >= threshold][:MAX_EXTRACTED]
    if not picked:
        return refusal()
    ans = Answer(status="answered", tokens=sentence_tokens(EXTRACTIVE_LEAD, [], first=True))
    for i in picked:
        c, s, e = spans[i]
        ans.tokens += sentence_tokens(texts[c.doc][s:e].replace("\n", " "), [c.n], first=False)
        ans.citations.append(Citation(n=c.n, chunk=c.chunk, doc=c.doc, start=s, end=e))
    return ans


def refusal(missing: list[str] | None = None) -> Answer:
    return Answer(
        status="refused", tokens=sentence_tokens(REFUSAL, [], first=True), missing=missing or []
    )
