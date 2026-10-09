/*
 * Cross-origin isolation for static hosts that cannot set headers (GitHub Pages).
 * The page registers this worker, which re-serves same-origin responses with
 * COOP/COEP so that multi-threaded WebAssembly (SharedArrayBuffer) is allowed.
 * Same technique as gzuidhof/coi-serviceworker, reduced to what RAGView needs.
 */
self.addEventListener('install', () => self.skipWaiting())
self.addEventListener('activate', (event) => event.waitUntil(self.clients.claim()))

self.addEventListener('fetch', (event) => {
  const request = event.request
  if (request.cache === 'only-if-cached' && request.mode !== 'same-origin') return
  if (new URL(request.url).origin !== self.location.origin) return
  event.respondWith(
    fetch(request).then((response) => {
      if (response.status === 0) return response
      const headers = new Headers(response.headers)
      headers.set('Cross-Origin-Opener-Policy', 'same-origin')
      headers.set('Cross-Origin-Embedder-Policy', 'require-corp')
      return new Response(response.body, {
        status: response.status,
        statusText: response.statusText,
        headers,
      })
    }),
  )
})
