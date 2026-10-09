/**
 * transformers.js wrappers for the two ONNX models. Used by the Web Worker in
 * the app and directly by the Node tests; Python loads the very same files.
 */
import {
  AutoModelForSequenceClassification,
  AutoTokenizer,
  type FeatureExtractionPipeline,
  pipeline,
  type ProgressCallback,
} from '@huggingface/transformers'

export const DTYPE = 'q8' // -> onnx/model_quantized.onnx
const BATCH = 16

export interface Embedder {
  embed(
    texts: string[],
    onBatch?: (offset: number, vectors: Float32Array[]) => void,
  ): Promise<Float32Array[]>
  tokenize(text: string): string[]
  countTokens(texts: string[]): number[]
}

export interface Reranker {
  rerank(query: string, passages: string[]): Promise<Float32Array>
}

export async function loadEmbedder(model: string, progress?: ProgressCallback): Promise<Embedder> {
  const extractor = (await pipeline('feature-extraction', model, {
    dtype: DTYPE,
    progress_callback: progress,
  })) as FeatureExtractionPipeline
  const tokenizer = extractor.tokenizer
  return {
    async embed(texts, onBatch) {
      const out: Float32Array[] = []
      for (let b = 0; b < texts.length; b += BATCH) {
        const tensor = await extractor(texts.slice(b, b + BATCH), {
          pooling: 'cls',
          normalize: true,
        })
        const [rows, dim] = tensor.dims as [number, number]
        const data = tensor.data as Float32Array
        const batch = Array.from({ length: rows }, (_, i) => data.slice(i * dim, (i + 1) * dim))
        out.push(...batch)
        onBatch?.(b, batch)
      }
      return out
    },
    tokenize: (text) => tokenizer.tokenize(text, { add_special_tokens: true }),
    countTokens: (texts) =>
      texts.map((t) => tokenizer.encode(t, { add_special_tokens: false }).length),
  }
}

export async function loadReranker(model: string, progress?: ProgressCallback): Promise<Reranker> {
  const tokenizer = await AutoTokenizer.from_pretrained(model, { progress_callback: progress })
  const net = await AutoModelForSequenceClassification.from_pretrained(model, {
    dtype: DTYPE,
    progress_callback: progress,
  })
  return {
    async rerank(query, passages) {
      const scores = new Float32Array(passages.length)
      for (let b = 0; b < passages.length; b += BATCH) {
        const batch = passages.slice(b, b + BATCH)
        const inputs = tokenizer(new Array(batch.length).fill(query), {
          text_pair: batch,
          padding: true,
          truncation: true,
        })
        const { logits } = await net(inputs)
        scores.set(logits.data as Float32Array, b)
      }
      return scores
    },
  }
}
