import numpy as np

from ragview.artifacts import load_chunkset
from ragview.embedding import embed
from ragview.retrieval import search


def test_search_is_sorted_and_breaks_ties_by_index():
    vectors = np.array([[1, 0], [0, 1], [1, 0], [0.6, 0.8]], dtype=np.float32)
    idx, scores = search(vectors, np.array([1, 0], dtype=np.float32), 3)
    assert idx.tolist() == [0, 2, 3]
    assert np.all(np.diff(scores) <= 0)


def test_embeddings_are_unit_vectors_and_semantic():
    v = embed(
        [
            "Voyager 1 entered interstellar space.",
            "The probe left the heliosphere.",
            "Pizza from Naples.",
        ]
    )
    assert np.allclose(np.linalg.norm(v, axis=1), 1, atol=1e-5)
    assert v[0] @ v[1] > v[0] @ v[2]


def test_curated_questions_retrieve_their_evidence_document(built, docs, curated):
    questions, _ = curated
    cs = load_chunkset("sentence-256-38")
    for q in questions:
        if not q.claims or q.id == "mercury-ambiguous":
            continue
        idx, _ = search(cs.vectors, embed([q.question])[0], 5)
        retrieved = {docs[cs.doc[i]].id for i in idx}
        assert q.claims[0].evidence[0].doc in retrieved, q.id


def test_out_of_corpus_question_is_below_threshold(built):
    cs = load_chunkset("sentence-256-38")
    _, scores = search(cs.vectors, embed(["What is the best pizza in Naples?"])[0], 1)
    assert scores[0] < 0.6
