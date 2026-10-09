"""Exact cosine search. Vectors are unit-norm, so cosine = dot product.

With a few thousand 384-d vectors a brute-force scan takes well under a
millisecond and returns exact scores, which is what we want to visualise.
An approximate index (HNSW, IVF) only pays off at hundreds of thousands of vectors.
"""

from __future__ import annotations

import numpy as np


def search(vectors: np.ndarray, query: np.ndarray, n: int) -> tuple[np.ndarray, np.ndarray]:
    """Return (indices, scores) of the n most similar vectors, best first.

    Ties are broken by index so results are deterministic across engines.
    """
    scores = vectors @ query
    order = np.lexsort((np.arange(len(scores)), -scores))[:n]
    return order, scores[order]
