"""ONNX models shared with the browser (same files transformers.js downloads)."""

from __future__ import annotations

from functools import cache, lru_cache

import onnxruntime as ort
from huggingface_hub import hf_hub_download
from tokenizers import Tokenizer

EMBED_MODEL = "Xenova/bge-small-en-v1.5"
RERANK_MODEL = "Xenova/ms-marco-MiniLM-L-6-v2"
ONNX_FILE = "onnx/model_quantized.onnx"  # transformers.js default (q8)
MAX_LENGTH = 512


@cache
def tokenizer(repo: str = EMBED_MODEL) -> Tokenizer:
    tok = Tokenizer.from_file(hf_hub_download(repo, "tokenizer.json"))
    tok.no_padding()
    tok.no_truncation()
    return tok


@cache
def model_tokenizer(repo: str) -> Tokenizer:
    """Tokenizer configured for model input: truncation to 512 and batch padding."""
    tok = Tokenizer.from_file(hf_hub_download(repo, "tokenizer.json"))
    tok.enable_truncation(MAX_LENGTH)
    tok.enable_padding()
    return tok


@cache
def session(repo: str) -> ort.InferenceSession:
    opts = ort.SessionOptions()
    opts.log_severity_level = 3
    return ort.InferenceSession(
        hf_hub_download(repo, ONNX_FILE), opts, providers=["CPUExecutionProvider"]
    )


@lru_cache(maxsize=200_000)
def count_tokens(text: str) -> int:
    """Number of WordPiece tokens, without [CLS]/[SEP]."""
    return len(tokenizer().encode(text, add_special_tokens=False).ids)
