"""2D projection of the embedding space.

UMAP is fitted offline on the reference preset; other presets are placed with
the same fitted model (`umap.transform`). In the browser umap-learn is not
available, so new points (queries, custom chunks) are placed with UMAP's own
out-of-sample initialisation: a membership-weighted mean of the 2D positions
of the k nearest neighbours in embedding space. `place` implements it and
`web/src/engine/project.ts` mirrors it.
"""

from __future__ import annotations

import math
from dataclasses import dataclass

import numpy as np

N_NEIGHBORS = 15
MIN_DIST = 0.1
SEED = 42


@dataclass
class Projection:
    reducer: object  # umap.UMAP (kept opaque to avoid importing umap at module load)
    center: np.ndarray
    scale: float

    def normalize(self, xy: np.ndarray) -> np.ndarray:
        return ((xy - self.center) / self.scale).astype(np.float32)


def fit(vectors: np.ndarray) -> tuple[Projection, np.ndarray]:
    """Fit UMAP and return the projection plus coordinates scaled into [-1, 1]."""
    import umap

    reducer = umap.UMAP(
        n_neighbors=N_NEIGHBORS, min_dist=MIN_DIST, metric="cosine", random_state=SEED
    )
    xy = reducer.fit_transform(vectors)
    lo, hi = xy.min(axis=0), xy.max(axis=0)
    proj = Projection(reducer, (lo + hi) / 2, float((hi - lo).max() / 2))
    return proj, proj.normalize(xy)


def transform(proj: Projection, vectors: np.ndarray) -> np.ndarray:
    return proj.normalize(proj.reducer.transform(vectors))


def membership_weights(distances: np.ndarray, k: int) -> np.ndarray:
    """UMAP's smooth-kNN memberships: exp(-(d - rho) / sigma), sum = log2(k)."""
    rho = float(distances.min())
    target = math.log2(k)
    lo, hi, sigma = 0.0, math.inf, 1.0
    for _ in range(64):
        psum = float(np.exp(-np.maximum(distances - rho, 0) / sigma).sum())
        if abs(psum - target) < 1e-5:
            break
        if psum > target:
            hi = sigma
            sigma = (lo + hi) / 2
        else:
            lo = sigma
            sigma = sigma * 2 if hi == math.inf else (lo + hi) / 2
    return np.exp(-np.maximum(distances - rho, 0) / sigma)


def place(
    query: np.ndarray, vectors: np.ndarray, xy: np.ndarray, k: int = N_NEIGHBORS
) -> tuple[np.ndarray, np.ndarray]:
    """Out-of-sample 2D position of `query`; returns (xy, neighbour indices)."""
    sims = vectors @ query
    idx = np.argsort(-sims, kind="stable")[:k]
    w = membership_weights(1.0 - sims[idx], k)
    return (w[:, None] * xy[idx]).sum(axis=0) / w.sum(), idx
