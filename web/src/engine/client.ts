/** Main-thread client for the model worker. */

export type WorkerRequest =
  | { id: number; op: 'load-embed' | 'load-rerank'; model: string }
  | { id: number; op: 'embed'; texts: string[]; partial?: boolean }
  | { id: number; op: 'tokenize'; text: string }
  | { id: number; op: 'count'; texts: string[] }
  | { id: number; op: 'rerank'; query: string; passages: string[] }

export type WorkerMessage =
  | { type: 'result'; id: number; result: unknown }
  | { type: 'error'; id: number; error: string }
  | { type: 'partial'; id: number; offset: number; vectors: Float32Array[] }
  | { type: 'progress'; which: 'embed' | 'rerank'; file: string; loaded: number; total: number }

type DistributiveOmit<T, K extends keyof T> = T extends unknown ? Omit<T, K> : never

export interface DownloadProgress {
  loaded: number
  total: number
}

export class ModelClient {
  private worker: Worker
  private nextId = 1
  private pending = new Map<
    number,
    {
      resolve: (v: unknown) => void
      reject: (e: Error) => void
      onPartial?: (offset: number, v: Float32Array[]) => void
    }
  >()
  private files: Record<'embed' | 'rerank', Map<string, DownloadProgress>> = {
    embed: new Map(),
    rerank: new Map(),
  }
  private loading: Partial<Record<'embed' | 'rerank', Promise<void>>> = {}

  constructor(
    private models: { embed: string; rerank: string },
    private onProgress: (which: 'embed' | 'rerank', p: DownloadProgress) => void = () => {},
  ) {
    this.worker = new Worker(new URL('./worker.ts', import.meta.url), { type: 'module' })
    this.worker.onmessage = (ev: MessageEvent<WorkerMessage>) => this.receive(ev.data)
  }

  private receive(msg: WorkerMessage) {
    if (msg.type === 'progress') {
      const files = this.files[msg.which]
      files.set(msg.file, { loaded: msg.loaded, total: msg.total })
      let loaded = 0
      let total = 0
      for (const f of files.values()) {
        loaded += f.loaded
        total += f.total
      }
      this.onProgress(msg.which, { loaded, total })
      return
    }
    const p = this.pending.get(msg.id)
    if (!p) return
    if (msg.type === 'partial') return p.onPartial?.(msg.offset, msg.vectors)
    this.pending.delete(msg.id)
    if (msg.type === 'error') p.reject(new Error(msg.error))
    else p.resolve(msg.result)
  }

  private call<T>(
    req: DistributiveOmit<WorkerRequest, 'id'>,
    onPartial?: (offset: number, v: Float32Array[]) => void,
  ): Promise<T> {
    const id = this.nextId++
    return new Promise<T>((resolve, reject) => {
      this.pending.set(id, { resolve: resolve as (v: unknown) => void, reject, onPartial })
      this.worker.postMessage({ ...req, id } as WorkerRequest)
    })
  }

  load(which: 'embed' | 'rerank'): Promise<void> {
    return (this.loading[which] ??= this.call<void>({
      op: which === 'embed' ? 'load-embed' : 'load-rerank',
      model: this.models[which],
    }).catch((e) => {
      delete this.loading[which]
      throw e
    }))
  }

  async embed(texts: string[], onPartial?: (offset: number, v: Float32Array[]) => void) {
    await this.load('embed')
    return this.call<Float32Array[]>({ op: 'embed', texts, partial: !!onPartial }, onPartial)
  }

  async tokenize(text: string) {
    await this.load('embed')
    return this.call<string[]>({ op: 'tokenize', text })
  }

  async countTokens(texts: string[]) {
    await this.load('embed')
    return this.call<number[]>({ op: 'count', texts })
  }

  async rerank(query: string, passages: string[]) {
    await this.load('rerank')
    return this.call<Float32Array>({ op: 'rerank', query, passages })
  }
}
