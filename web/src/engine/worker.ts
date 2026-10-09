/// <reference lib="webworker" />
/**
 * Web Worker hosting the models, so inference never blocks the UI thread.
 * Protocol: see WorkerRequest / WorkerMessage in client.ts.
 */
import { env, type ProgressInfo } from '@huggingface/transformers'
import type { WorkerMessage, WorkerRequest } from './client'
import { type Embedder, loadEmbedder, loadReranker, type Reranker } from './models'

env.allowLocalModels = false
// Threads need SharedArrayBuffer, i.e. a cross-origin isolated page (see public/coi-sw.js).
if (self.crossOriginIsolated && env.backends.onnx.wasm) {
  env.backends.onnx.wasm.numThreads = Math.min(
    4,
    Math.max(1, (navigator.hardwareConcurrency || 2) - 1),
  )
}

let embedder: Promise<Embedder> | null = null
let reranker: Promise<Reranker> | null = null

const post = (msg: WorkerMessage, transfer: Transferable[] = []) =>
  (self as DedicatedWorkerGlobalScope).postMessage(msg, transfer)

const progress = (which: 'embed' | 'rerank') => (p: ProgressInfo) => {
  if (p.status === 'progress') {
    post({ type: 'progress', which, file: p.file, loaded: p.loaded, total: p.total })
  }
}

self.onmessage = async (ev: MessageEvent<WorkerRequest>) => {
  const req = ev.data
  try {
    switch (req.op) {
      case 'load-embed':
        embedder ??= loadEmbedder(req.model, progress('embed'))
        await embedder
        return post({ type: 'result', id: req.id, result: null })
      case 'load-rerank':
        reranker ??= loadReranker(req.model, progress('rerank'))
        await reranker
        return post({ type: 'result', id: req.id, result: null })
      case 'embed': {
        const vectors = await (
          await embedder!
        ).embed(req.texts, (offset, batch) => {
          if (req.partial) post({ type: 'partial', id: req.id, offset, vectors: batch })
        })
        return post(
          { type: 'result', id: req.id, result: vectors },
          vectors.map((v) => v.buffer),
        )
      }
      case 'tokenize':
        return post({ type: 'result', id: req.id, result: (await embedder!).tokenize(req.text) })
      case 'count':
        return post({
          type: 'result',
          id: req.id,
          result: (await embedder!).countTokens(req.texts),
        })
      case 'rerank': {
        const scores = await (await reranker!).rerank(req.query, req.passages)
        return post({ type: 'result', id: req.id, result: scores }, [scores.buffer])
      }
    }
  } catch (err) {
    post({ type: 'error', id: req.id, error: err instanceof Error ? err.message : String(err) })
  }
}
