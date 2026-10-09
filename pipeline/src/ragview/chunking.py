"""Token-aware chunking.

This module is the reference implementation; `web/src/engine/chunker.ts` mirrors
it line by line and both are checked against `shared/fixtures/chunking.json`.

Text is segmented into *units* (sentences or words), each with a token count
from the embedding model's tokenizer. Units are then packed greedily into
chunks of at most `size` tokens; consecutive chunks share up to `overlap`
tokens worth of trailing units. Chunks never cut through a word.
"""

from __future__ import annotations

import re
from collections.abc import Callable
from dataclasses import dataclass
from typing import Literal

Strategy = Literal["sentence", "fixed"]
TokenCounter = Callable[[str], int]

# Words after which a period does not end a sentence (compared lower-case).
ABBREVIATIONS = frozenset(
    [
        "mr",
        "mrs",
        "ms",
        "dr",
        "prof",
        "sr",
        "jr",
        "st",
        "vs",
        "etc",
        "e.g",
        "i.e",
        "no",
        "nos",
        "inc",
        "ltd",
        "co",
        "corp",
        "approx",
        "fig",
        "figs",
        "mt",
        "ft",
        "gen",
        "col",
        "lt",
        "capt",
        "sgt",
        "cmdr",
        "adm",
        "gov",
        "sen",
        "rep",
        "u.s",
        "u.k",
        "u.n",
        "jan",
        "feb",
        "aug",
        "sep",
        "sept",
        "oct",
        "nov",
        "dec",
        "ca",
        "c",
    ]
)

_PARAGRAPH = re.compile(r"[^\n]+(?:\n(?!\n)[^\n]+)*")
_WORD = re.compile(r"\S+")
_SENTENCE_END = re.compile(r"[.!?]+[\"'\u201d\u2019)\]]*\s+")
_SENTENCE_START = re.compile(r"[A-Z\u00c0-\u00de0-9\"'\u201c\u2018(\[]")
_WORD_LEAD = re.compile(r"^[\"'\u201c\u2018(\[]+")


@dataclass(frozen=True)
class Unit:
    start: int
    end: int
    tokens: int


@dataclass(frozen=True)
class Span:
    start: int
    end: int
    tokens: int


def split_sentences(text: str) -> list[tuple[int, int]]:
    """Return (start, end) character spans of sentences; paragraphs are hard breaks."""
    spans: list[tuple[int, int]] = []
    for para in _PARAGRAPH.finditer(text):
        base, body = para.start(), para.group()
        start = 0
        for m in _SENTENCE_END.finditer(body):
            nxt = m.end()
            if nxt >= len(body) or not _SENTENCE_START.match(body, nxt):
                continue
            punct_end = m.end() - (len(m.group()) - len(m.group().rstrip()))
            if body[m.start()] == "." and _is_abbreviation(body, start, m.start()):
                continue
            spans.append((base + start, base + punct_end))
            start = nxt
        end = len(body.rstrip())
        if start < end:
            spans.append((base + start, base + end))
    return spans


def _is_abbreviation(body: str, sentence_start: int, dot: int) -> bool:
    ws = max(body.rfind(" ", sentence_start, dot), body.rfind("\n", sentence_start, dot))
    word = _WORD_LEAD.sub("", body[ws + 1 : dot]).lower()
    return word in ABBREVIATIONS or (len(word) == 1 and word.isalpha())


def word_units(text: str, start: int, end: int, count: TokenCounter) -> list[Unit]:
    return [
        Unit(start + m.start(), start + m.end(), count(m.group()))
        for m in _WORD.finditer(text[start:end])
    ]


def make_units(text: str, strategy: Strategy, size: int, count: TokenCounter) -> list[Unit]:
    if strategy == "fixed":
        return word_units(text, 0, len(text), count)
    units: list[Unit] = []
    for s, e in split_sentences(text):
        words = word_units(text, s, e, count)
        total = sum(w.tokens for w in words)
        if total <= size:
            units.append(Unit(s, e, total))
        else:
            # Over-long sentence: fall back to word windows of at most `size` tokens.
            units.extend(pack(words, size, 0))
    return units


def pack(units: list[Unit], size: int, overlap: int) -> list[Unit]:
    """Greedily pack units into chunks of <= size tokens with <= overlap shared tokens."""
    chunks: list[Unit] = []
    i, n = 0, len(units)
    while i < n:
        j, tokens = i, 0
        while j < n and (j == i or tokens + units[j].tokens <= size):
            tokens += units[j].tokens
            j += 1
        chunks.append(Unit(units[i].start, units[j - 1].end, tokens))
        if j >= n:
            break
        k, shared = j, 0
        while k - 1 > i and shared + units[k - 1].tokens <= overlap:
            shared += units[k - 1].tokens
            k -= 1
        i = k
    return chunks


def chunk_text(
    text: str, size: int, overlap: int, strategy: Strategy, count: TokenCounter
) -> list[Span]:
    if size < 1 or overlap < 0 or overlap >= size:
        raise ValueError("require size >= 1 and 0 <= overlap < size")
    units = make_units(text, strategy, size, count)
    return [Span(u.start, u.end, u.tokens) for u in pack(units, size, overlap)]
