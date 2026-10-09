import math

import numpy as np

from ragview import projection
from ragview.artifacts import load_chunkset


def test_membership_weights_sum_to_log2_k():
    d = np.sort(np.random.default_rng(1).uniform(0.1, 0.6, 15))
    w = projection.membership_weights(d, 15)
    assert math.isclose(w.sum(), math.log2(15), rel_tol=1e-4)
    assert w[0] == 1.0 and np.all(np.diff(w) <= 0)


def test_out_of_sample_placement_tracks_umap_transform(built):
    """The browser places new points with `place`; it must agree with umap.transform."""
    ref, other = load_chunkset("sentence-256-38"), load_chunkset("sentence-128-19")
    proj, xy = projection.fit(ref.vectors)
    assert np.abs(xy - ref.xy).max() < 1e-3  # the fit is deterministic
    pick = np.random.default_rng(0).choice(len(other), 100, replace=False)
    umap_xy = projection.transform(proj, other.vectors[pick])
    knn_xy = np.stack([projection.place(v, ref.vectors, ref.xy)[0] for v in other.vectors[pick]])
    assert np.median(np.linalg.norm(umap_xy - knn_xy, axis=1)) < 0.1
