import itertools
import json
import re

import pytest

from ragview.chunking import Unit, chunk_text, pack, split_sentences
from ragview.models import count_tokens
from ragview.paths import FIXTURES_DIR


def words(text: str) -> int:
    return 1  # one token per word: makes expectations easy to reason about


def test_sentences_respect_abbreviations_and_initials():
    text = "Dr. Smith met J. F. Kennedy in the U.S. capital. It rained. Then 3 people left!"
    spans = [text[s:e] for s, e in split_sentences(text)]
    assert spans == [
        "Dr. Smith met J. F. Kennedy in the U.S. capital.",
        "It rained.",
        "Then 3 people left!",
    ]


def test_paragraphs_are_hard_breaks():
    text = "First paragraph without a period\n\nSecond one. Third one."
    spans = [text[s:e] for s, e in split_sentences(text)]
    assert spans == ["First paragraph without a period", "Second one.", "Third one."]


def test_no_split_before_lowercase():
    text = "It reached 3 km. above the ground. Then it fell."
    assert [text[s:e] for s, e in split_sentences(text)] == [
        "It reached 3 km. above the ground.",
        "Then it fell.",
    ]


def test_pack_respects_size_and_overlap():
    units = [Unit(i * 10, i * 10 + 9, t) for i, t in enumerate([3, 3, 3, 3, 3, 3])]
    chunks = pack(units, size=7, overlap=3)
    assert [c.tokens for c in chunks] == [6, 6, 6, 6, 6]
    assert all(c.tokens <= 7 for c in chunks)
    # Each chunk starts with the last unit of the previous one (3 shared tokens).
    assert [c.start for c in chunks] == [0, 10, 20, 30, 40]


def test_pack_always_progresses_with_oversized_unit():
    units = [Unit(0, 5, 10), Unit(6, 9, 2)]
    assert [(c.start, c.end) for c in pack(units, size=4, overlap=3)] == [(0, 5), (6, 9)]


def test_invalid_parameters():
    with pytest.raises(ValueError):
        chunk_text("abc", 10, 10, "sentence", words)


@pytest.mark.parametrize(
    "strategy,size,overlap", [("sentence", 48, 0), ("sentence", 128, 38), ("fixed", 64, 16)]
)
def test_invariants_on_real_corpus(docs, strategy, size, overlap):
    for doc in docs[:8]:
        spans = chunk_text(doc.text, size, overlap, strategy, count_tokens)
        # Every word of the document lands in at least one chunk, and no chunk cuts a word.
        covered = set()
        for s in spans:
            assert s.tokens <= size or len(doc.text[s.start : s.end].split()) == 1
            assert not doc.text[s.start].isspace() and not doc.text[s.end - 1].isspace()
            assert (
                s.end == len(doc.text)
                or not doc.text[s.end].isalnum()
                or doc.text[s.end - 1] in ".!?"
            )
            covered.update(range(s.start, s.end))
        for m in re.finditer(r"\S+", doc.text):
            assert m.start() in covered
        # Chunks are ordered and overlaps never exceed the budget.
        for a, b in itertools.pairwise(spans):
            assert a.start < b.start
            if b.start < a.end:
                assert count_tokens(doc.text[b.start : a.end]) <= overlap


def test_token_counts_are_additive_over_words():
    text = "Voyager 1's heliopause crossing (2012) was confirmed—finally!"
    assert count_tokens(text) == sum(count_tokens(w) for w in text.split())


def test_matches_committed_fixtures(docs):
    fixture = json.loads((FIXTURES_DIR / "chunking.json").read_text())
    by_id = {d.id: d for d in docs}
    for doc_id, spans in fixture["sentences"].items():
        assert [list(s) for s in split_sentences(by_id[doc_id].text)] == spans
    for case in fixture["chunks"]:
        got = chunk_text(
            by_id[case["doc"]].text, case["size"], case["overlap"], case["strategy"], count_tokens
        )
        assert [[s.start, s.end, s.tokens] for s in got] == case["spans"]
