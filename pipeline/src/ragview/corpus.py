"""Fetch, clean and load the curated Wikipedia corpus.

The fetched texts are committed to the repository, so builds are reproducible
without network access; `fetch` is only needed to refresh or extend the corpus.
"""

from __future__ import annotations

import json
import os
import re
import time
import unicodedata
from dataclasses import dataclass
from datetime import UTC, datetime

import httpx
import yaml

from .paths import DOCS_DIR, LOCK_FILE, SOURCES_FILE

API_URL = "https://en.wikipedia.org/w/api.php"
# Wikimedia's robot policy asks for a contact in the User-Agent: set RAGVIEW_CONTACT
# (a URL or e-mail) before fetching.
USER_AGENT = "RAGView/0.1 (educational RAG visualizer; {contact})"

DROP_SECTIONS = {
    "see also",
    "references",
    "notes",
    "external links",
    "further reading",
    "bibliography",
    "gallery",
    "citations",
    "sources",
    "footnotes",
    "works cited",
    "explanatory notes",
    "general and cited references",
}

_HEADING = re.compile(r"^(={2,6})\s*(.*?)\s*\1\s*$")
_DISPLAYSTYLE = re.compile(r"\{\\displaystyle[^\n]*?\}\s*")


@dataclass(frozen=True)
class Document:
    id: str
    title: str
    url: str
    category: str
    text: str


def slugify(title: str) -> str:
    s = re.sub(r"[\u2010-\u2015]", "-", title)  # dashes, e.g. "Cassini\u2013Huygens"
    s = unicodedata.normalize("NFKD", s).encode("ascii", "ignore").decode()
    return re.sub(r"[^a-z0-9]+", "-", s.lower()).strip("-")


def normalize_text(text: str) -> str:
    """NFC-normalise, drop astral-plane and invisible format characters.

    Dropping non-BMP characters keeps Python (code points) and JavaScript
    (UTF-16 code units) character offsets identical. Format characters (Cf,
    e.g. U+FEFF) are removed because Python and JavaScript disagree on whether
    some of them are whitespace, which would change word boundaries.
    """
    text = unicodedata.normalize("NFC", text)
    return "".join(ch for ch in text if ord(ch) <= 0xFFFF and unicodedata.category(ch) != "Cf")


def clean_extract(raw: str, max_words: int) -> str:
    """Turn a plain-text MediaWiki extract into clean paragraphs."""
    paragraphs: list[str] = []
    drop_level: int | None = None
    for line in raw.splitlines():
        m = _HEADING.match(line.strip())
        if m:
            level, name = len(m.group(1)), m.group(2).strip().lower()
            if drop_level is not None and level > drop_level:
                continue
            drop_level = level if name in DROP_SECTIONS else None
            continue
        if drop_level is not None:
            continue
        line = _DISPLAYSTYLE.sub("", line)
        line = re.sub(r"\s+", " ", line).strip()
        # Skip empty lines and leftovers such as stray formulas or captions.
        if len(line.split()) < 6:
            continue
        paragraphs.append(line)

    kept: list[str] = []
    words = 0
    for p in paragraphs:
        n = len(p.split())
        if kept and words + n > max_words:
            break
        kept.append(p)
        words += n
    return normalize_text("\n\n".join(kept))


def fetch_corpus() -> None:
    """Download every article in sources.yaml and write docs + lock file."""
    sources = yaml.safe_load(SOURCES_FILE.read_text())
    DOCS_DIR.mkdir(parents=True, exist_ok=True)
    lock = []
    contact = os.environ.get("RAGVIEW_CONTACT", "corpus ingestion script")
    headers = {"User-Agent": USER_AGENT.format(contact=contact)}
    with httpx.Client(http2=True, headers=headers, timeout=30) as client:
        for entry in sources["documents"]:
            r = _get_with_retry(
                client,
                {
                    "action": "query",
                    "format": "json",
                    "formatversion": 2,
                    "prop": "extracts|revisions|info",
                    "inprop": "url",
                    "rvprop": "ids",
                    "explaintext": 1,
                    "exsectionformat": "wiki",
                    "redirects": 1,
                    "titles": entry["title"],
                },
            )
            page = r.json()["query"]["pages"][0]
            if page.get("missing"):
                raise RuntimeError(f"Wikipedia page not found: {entry['title']}")
            slug = slugify(page["title"])
            text = clean_extract(page["extract"], sources["max_words"])
            (DOCS_DIR / f"{slug}.txt").write_text(text + "\n")
            lock.append(
                {
                    "id": slug,
                    "title": page["title"],
                    "url": page["fullurl"],
                    "revid": page["revisions"][0]["revid"],
                    "category": entry["category"],
                    "words": len(text.split()),
                }
            )
            print(f"  {page['title']:<40} {lock[-1]['words']:>5} words")
    fetched_at = datetime.now(UTC).date().isoformat()
    LOCK_FILE.write_text(json.dumps({"fetched_at": fetched_at, "documents": lock}, indent=2) + "\n")
    _write_attribution(sources, lock, fetched_at)


def _get_with_retry(client: httpx.Client, params: dict, attempts: int = 5) -> httpx.Response:
    """GET with a polite delay and exponential backoff on HTTP 429."""
    for attempt in range(attempts):
        time.sleep(1.0)
        r = client.get(API_URL, params=params)
        if r.status_code != 429:
            r.raise_for_status()
            return r
        time.sleep(2 ** (attempt + 2))
    r.raise_for_status()
    return r


def _write_attribution(sources: dict, lock: list[dict], fetched_at: str) -> None:
    lines = [
        "# Corpus attribution",
        "",
        f"The texts in `docs/` are excerpts of English Wikipedia articles, licensed under "
        f"[{sources['license']}](https://creativecommons.org/licenses/by-sa/4.0/). "
        f"They were fetched on {fetched_at}, cleaned (reference sections removed, "
        f"whitespace normalised) and truncated to about {sources['max_words']} words. "
        "Authors are listed in each article's revision history (linked below).",
        "",
        "| Article | Revision | History |",
        "|---|---|---|",
    ]
    for d in lock:
        oldid = f"{d['url'].split('/wiki/')[0]}/w/index.php?oldid={d['revid']}"
        history = f"{d['url'].split('/wiki/')[0]}/w/index.php?title={d['url'].split('/wiki/')[1]}&action=history"
        lines.append(
            f"| [{d['title']}]({d['url']}) | [{d['revid']}]({oldid}) | [history]({history}) |"
        )
    (DOCS_DIR.parent / "ATTRIBUTION.md").write_text("\n".join(lines) + "\n")


def load_corpus() -> list[Document]:
    """Load the committed corpus in lock-file order."""
    lock = json.loads(LOCK_FILE.read_text())
    return [
        Document(
            id=d["id"],
            title=d["title"],
            url=d["url"],
            category=d["category"],
            text=(DOCS_DIR / f"{d['id']}.txt").read_text().rstrip("\n"),
        )
        for d in lock["documents"]
    ]


def load_categories() -> dict[str, str]:
    return yaml.safe_load(SOURCES_FILE.read_text())["categories"]
