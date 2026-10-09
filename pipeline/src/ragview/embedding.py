"""Sentence embeddings with bge-small-en-v1.5: CLS pooling + L2 normalisation."""

from __future__ import annotations

import numpy as np

from .models import EMBED_MODEL, model_tokenizer, session

DIM = 384


def embed(texts: list[str], batch_size: int = 32) -> np.ndarray:
    """Return an (n, 384) float32 matrix of unit vectors."""
    tok, sess = model_tokenizer(EMBED_MODEL), session(EMBED_MODEL)
    out = np.empty((len(texts), DIM), dtype=np.float32)
    for b in range(0, len(texts), batch_size):
        enc = tok.encode_batch(texts[b : b + batch_size])
        feeds = {
            "input_ids": np.array([e.ids for e in enc], dtype=np.int64),
            "attention_mask": np.array([e.attention_mask for e in enc], dtype=np.int64),
            "token_type_ids": np.array([e.type_ids for e in enc], dtype=np.int64),
        }
        cls = sess.run(["last_hidden_state"], feeds)[0][:, 0, :]
        out[b : b + len(enc)] = cls / np.linalg.norm(cls, axis=1, keepdims=True)
    return out
