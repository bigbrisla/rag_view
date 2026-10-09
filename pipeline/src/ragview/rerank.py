"""Cross-encoder reranking with ms-marco-MiniLM-L-6-v2."""

from __future__ import annotations

import numpy as np

from .models import RERANK_MODEL, model_tokenizer, session


def rerank_scores(query: str, passages: list[str], batch_size: int = 16) -> np.ndarray:
    """Relevance logits for (query, passage) pairs; higher is more relevant."""
    tok, sess = model_tokenizer(RERANK_MODEL), session(RERANK_MODEL)
    scores = np.empty(len(passages), dtype=np.float32)
    for b in range(0, len(passages), batch_size):
        enc = tok.encode_batch([(query, p) for p in passages[b : b + batch_size]])
        feeds = {
            "input_ids": np.array([e.ids for e in enc], dtype=np.int64),
            "attention_mask": np.array([e.attention_mask for e in enc], dtype=np.int64),
            "token_type_ids": np.array([e.type_ids for e in enc], dtype=np.int64),
        }
        scores[b : b + len(enc)] = sess.run(["logits"], feeds)[0][:, 0]
    return scores


def sigmoid(x: np.ndarray | float) -> np.ndarray | float:
    return 1.0 / (1.0 + np.exp(-x))
