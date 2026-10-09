"""Retrieval evaluation: document-level hit rate and MRR per chunking preset.

Run `uv run ragview eval` after `ragview build`. Results go to
web/public/data/eval.json (shown in the app) and, with --markdown, to stdout.
"""

from __future__ import annotations

import json

import numpy as np
import yaml

from .artifacts import load_chunkset, load_manifest
from .corpus import load_corpus
from .embedding import embed
from .paths import EVAL_DIR, WEB_DATA_DIR
from .rerank import rerank_scores
from .retrieval import search

PRESETS = ("sentence-48-0", "sentence-128-19", "sentence-256-38", "sentence-448-67", "fixed-256-38")
K = (1, 3, 5)
RERANK_POOL = 20


def doc_ranks(ranked_docs: list[int]) -> list[int]:
    """Collapse a ranked list of chunk documents into distinct documents, in order."""
    return list(dict.fromkeys(ranked_docs))


def metrics(gold_ranks: list[int | None]) -> dict[str, float]:
    """gold_ranks: 1-based rank of the first chunk from the gold document (None = miss)."""
    n = len(gold_ranks)
    out = {f"hit@{k}": sum(r is not None and r <= k for r in gold_ranks) / n for k in K}
    out["mrr@10"] = sum(1 / r for r in gold_ranks if r is not None and r <= 10) / n
    return {k: round(v, 3) for k, v in out.items()}


def main(markdown: bool = False) -> None:
    docs = load_corpus()
    doc_index = {d.id: i for i, d in enumerate(docs)}
    qs = yaml.safe_load((EVAL_DIR / "questions.yaml").read_text())["questions"]
    qvecs = embed([q["q"] for q in qs])
    available = {p["id"] for p in load_manifest()["presets"]}
    rows = []
    for pid in PRESETS:
        if pid not in available:
            continue
        cs = load_chunkset(pid)
        for rerank in (False, True):
            ranks: list[int | None] = []
            for q, v in zip(qs, qvecs, strict=True):
                idx, _ = search(cs.vectors, v, RERANK_POOL)
                if rerank:
                    texts = [docs[cs.doc[i]].text[cs.start[i] : cs.end[i]] for i in idx]
                    s = rerank_scores(q["q"], texts)
                    idx = idx[np.lexsort((np.arange(len(s)), -s))]
                gold = doc_index[q["doc"]]
                rank = next((r + 1 for r, i in enumerate(idx) if cs.doc[i] == gold), None)
                ranks.append(rank)
            rows.append({"preset": pid, "rerank": rerank, "n_chunks": len(cs), **metrics(ranks)})
            print(f"  {pid:<18} rerank={'on ' if rerank else 'off'} {rows[-1]}")
    result = {"n_questions": len(qs), "rerank_pool": RERANK_POOL, "level": "chunk", "rows": rows}
    (WEB_DATA_DIR / "eval.json").write_text(json.dumps(result, indent=1))
    if markdown:
        print(
            "\n| Chunking | Rerank | Chunks | Hit@1 | Hit@3 | Hit@5 | MRR@10 |\n|---|---|---|---|---|---|---|"
        )
        for r in rows:
            print(
                f"| `{r['preset']}` | {'yes' if r['rerank'] else 'no'} | {r['n_chunks']} | "
                f"{r['hit@1']:.2f} | {r['hit@3']:.2f} | {r['hit@5']:.2f} | {r['mrr@10']:.2f} |"
            )
