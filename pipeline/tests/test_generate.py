from ragview.generate import (
    Claim,
    ContextChunk,
    Evidence,
    covering_chunks,
    scripted,
    sentence_tokens,
)


def ctx(n, start, end, doc="d"):
    return ContextChunk(n=n, chunk=n * 10, doc=doc, start=start, end=end)


def test_citation_markers_go_before_final_period():
    toks = sentence_tokens("It flew in 2012.", [2, 1], first=True)
    assert [(t.text, t.cite) for t in toks] == [
        ("It", None),
        (" flew", None),
        (" in", None),
        (" 2012", None),
        ("", 2),
        ("", 1),
        (".", None),
    ]


def test_evidence_covered_by_union_of_chunks():
    ev = Evidence("d", 10, 30)
    assert covering_chunks(ev, [ctx(1, 0, 20), ctx(2, 18, 40)]) is not None
    assert covering_chunks(ev, [ctx(1, 0, 20), ctx(2, 22, 40)]) is None  # gap at 20..22
    assert covering_chunks(ev, [ctx(1, 0, 40, doc="other")]) is None


def test_scripted_answer_degrades_with_missing_evidence():
    claims = [
        Claim("first fact", "Fact one.", [Evidence("d", 0, 10)]),
        Claim("second fact", "Fact two.", [Evidence("d", 50, 60)]),
    ]
    full = scripted(claims, [ctx(1, 0, 20), ctx(2, 45, 70)])
    assert full.status == "answered" and not full.missing
    assert {c.n for c in full.citations} == {1, 2}

    partial = scripted(claims, [ctx(1, 0, 20)])
    assert partial.status == "partial" and partial.missing == ["second fact"]

    none = scripted(claims, [])
    assert none.status == "refused" and none.missing == ["first fact", "second fact"]
