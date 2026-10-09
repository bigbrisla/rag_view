"""Command-line entry point: `uv run ragview <command>`."""

from __future__ import annotations

import argparse
import json


def main() -> None:
    parser = argparse.ArgumentParser(prog="ragview", description="RAGView offline pipeline")
    sub = parser.add_subparsers(dest="command", required=True)
    sub.add_parser("fetch", help="download the Wikipedia corpus (set RAGVIEW_CONTACT)")
    sub.add_parser("build", help="build web/public/data from the committed corpus")
    sub.add_parser("schema", help="export the trace JSON Schema")
    ev = sub.add_parser("eval", help="retrieval evaluation (hit rate, MRR)")
    ev.add_argument("--markdown", action="store_true", help="print a README-ready table")

    tr = sub.add_parser("trace", help="run one question and print its trace")
    tr.add_argument("question")
    tr.add_argument("--chunk-size", type=int)
    tr.add_argument("--overlap", type=int)
    tr.add_argument("--strategy", choices=["sentence", "fixed"])
    tr.add_argument("--top-k", type=int)
    tr.add_argument("--threshold", type=float)
    tr.add_argument("--rerank", action="store_true")
    tr.add_argument("--json", action="store_true", help="print the full trace as JSON")
    args = parser.parse_args()

    if args.command == "fetch":
        from .corpus import fetch_corpus

        fetch_corpus()
    elif args.command == "build":
        from .build import build

        build()
    elif args.command == "schema":
        from .build import export_schema

        export_schema()
    elif args.command == "eval":
        from .evaluate import main as eval_main

        eval_main(markdown=args.markdown)
    elif args.command == "trace":
        _trace(args)


def _trace(args: argparse.Namespace) -> None:
    from .artifacts import corpus_version, load_chunkset, load_curated, load_manifest, preset_id
    from .build import make_chunkset
    from .corpus import load_corpus
    from .embedding import embed
    from .engine import Context, run
    from .schema import Params

    overrides = {
        k: v
        for k, v in {
            "chunk_size": args.chunk_size,
            "overlap": args.overlap,
            "strategy": args.strategy,
            "top_k": args.top_k,
            "threshold": args.threshold,
            "rerank": args.rerank or None,
        }.items()
        if v is not None
    }
    params = Params(**overrides)
    docs = load_corpus()
    manifest = load_manifest()
    curated, _ = load_curated(docs)
    ref_id = manifest["projection"]["fitted_on"]
    pid = preset_id(params.strategy, params.chunk_size, params.overlap)
    known = {p["id"] for p in manifest["presets"]}
    if pid in known:
        chunks, precomputed = load_chunkset(pid), True
    else:
        print(f"(no preset {pid}: chunking and embedding the corpus now...)")
        chunks, precomputed = (
            make_chunkset(
                docs,
                (params.strategy, params.chunk_size, params.overlap),
                embed,
                load_chunkset(ref_id),
            ),
            False,
        )
    ctx = Context(docs, corpus_version(docs), curated, ref_id)
    trace = run(args.question, params, chunks, ctx, precomputed=precomputed)
    if args.json:
        print(trace.model_dump_json(indent=2))
        return
    _print_trace(trace, {d.id: d for d in docs})


def _print_trace(trace, docs) -> None:
    for e in trace.events:
        p = e.phase
        if p == "chunking":
            print(
                f"1 chunking   {e.preset}: {e.n_chunks} chunks (avg {e.avg_tokens} tokens) over {e.n_docs} docs"
            )
        elif p == "embedding":
            print(
                f"2 embedding  {e.n_vectors} x {e.dim}-d vectors ({e.model}, {e.pooling} pooling)"
            )
        elif p == "indexing":
            print(
                f"3 indexing   {e.index}, {e.bytes / 1e6:.2f} MB; UMAP fitted on {e.projection.fitted_on}"
            )
        elif p == "query":
            print(
                f"4 query      {len(e.tokens)} tokens -> 2D ({e.position.x:+.3f}, {e.position.y:+.3f})  [{e.duration_ms:.0f} ms]"
            )
        elif p == "retrieval":
            print(f"5 retrieval  top-{e.top_k}, threshold {e.threshold}  [{e.duration_ms:.1f} ms]")
            for c in e.candidates[:10]:
                mark = "*" if c.chunk in e.selected else " "
                print(
                    f"   {mark} #{c.rank:<2} {c.score:.3f}  {docs[c.doc].title}  (chunk {c.chunk})"
                )
        elif p == "rerank":
            if e.enabled:
                print(f"6 rerank     {e.model}  [{e.duration_ms:.0f} ms]")
                for it in sorted(e.items, key=lambda i: i.rerank_rank)[:10]:
                    print(
                        f"     {it.retrieval_rank:>2} -> {it.rerank_rank:<2} logit {it.rerank_score:+.2f}  chunk {it.chunk}"
                    )
            else:
                print("6 rerank     off")
        elif p == "prompt":
            tc = e.token_counts
            print(
                f"7 prompt     {len(e.context)} sources; tokens: system {tc.system} + context {tc.context} + question {tc.question} = {tc.total}"
            )
        elif p == "generation":
            text = "".join(f"[{t.cite}]" if t.cite else t.text for t in e.tokens)
            print(f"8 generation ({e.generator}, simulated) status={e.status}")
            print(f"   {text}")
            if e.missing:
                print(f"   missing: {e.missing}")
            if e.no_rag:
                print(f"   without RAG (illustrative): {e.no_rag.text}")
    print(json.dumps({"trace_id": trace.id, "corpus": trace.corpus.version}))


if __name__ == "__main__":
    main()
