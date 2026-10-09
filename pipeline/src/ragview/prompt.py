"""Prompt template for grounded question answering."""

from __future__ import annotations

from dataclasses import dataclass

from .models import count_tokens

TEMPLATE_ID = "grounded-qa-v1"
SYSTEM = (
    "You answer questions about space exploration using only the numbered sources below. "
    "Cite every claim with its source number, like [1]. "
    "If the sources do not contain the answer, say that you don't know."
)


@dataclass(frozen=True)
class Source:
    n: int
    title: str
    text: str


def render_sources(sources: list[Source]) -> str:
    if not sources:
        return "Sources:\n\n(none)"
    return "Sources:\n\n" + "\n\n".join(f"[{s.n}] {s.title}\n{s.text}" for s in sources)


def render_question(question: str) -> str:
    return f"Question: {question}"


def build_prompt(question: str, sources: list[Source]) -> tuple[str, dict[str, int]]:
    """Return the full prompt text and its token counts per section."""
    parts = {
        "system": SYSTEM,
        "context": render_sources(sources),
        "question": render_question(question),
    }
    counts = {k: count_tokens(v) for k, v in parts.items()}
    counts["total"] = sum(counts.values())
    return "\n\n".join(parts.values()), counts
