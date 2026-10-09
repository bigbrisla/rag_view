/**
 * IndexedDB cache for chunk sets built in the browser, so a custom index is
 * embedded only once per device. Every call degrades to a no-op when storage
 * is unavailable (private windows, blocked site data).
 */
import type { ChunkSet } from './types'

const DB = 'ragview'
const STORE = 'chunksets'

function open(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB, 1)
    req.onupgradeneeded = () => req.result.createObjectStore(STORE)
    req.onsuccess = () => resolve(req.result)
    req.onerror = () => reject(req.error)
  })
}

export async function getCached(key: string): Promise<ChunkSet | null> {
  try {
    const db = await open()
    return await new Promise((resolve) => {
      const req = db.transaction(STORE).objectStore(STORE).get(key)
      req.onsuccess = () => resolve((req.result as ChunkSet | undefined) ?? null)
      req.onerror = () => resolve(null)
    })
  } catch {
    return null
  }
}

export async function putCached(key: string, cs: ChunkSet): Promise<void> {
  try {
    const db = await open()
    db.transaction(STORE, 'readwrite').objectStore(STORE).put(cs, key)
  } catch {
    /* storage unavailable: nothing to do */
  }
}
