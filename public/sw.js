const CACHE = 'cifra-shell-v8'

// Replaced at build time with the hashed JS/CSS/image URLs emitted by Vite.
const BUILD_ASSETS = /*__PRECACHE__*/[]/*__PRECACHE_END__*/

const SHELL = [
  '/',
  '/index.html',
  '/manifest.webmanifest',
  '/icons/icon-192.png',
  '/icons/icon-512.png',
  '/icons/maskable-512.png',
  '/apple-touch-icon.png',
].concat(BUILD_ASSETS)

/**
 * Static hosts may answer with `Vary: Origin`. The precached entries were written by
 * `cache.add()` without an Origin header, so a plain `caches.match()` from a
 * document-initiated `<link>`/`<script>` request misses them and the offline load
 * falls through to the network. `ignoreVary` fixes the engines that implement it; the
 * pathname sweep covers the rest.
 */
async function lookup(key) {
  const request = typeof key === 'string' ? new Request(String(new URL(key, self.location.href))) : key
  const cache = await caches.open(CACHE)
  const hit = await cache.match(request, { ignoreVary: true })
  if (hit) return hit

  const { pathname } = new URL(request.url)
  const keys = await cache.keys()
  for (const entry of keys) {
    if (new URL(entry.url).pathname !== pathname) continue
    const found = await cache.match(entry, { ignoreVary: true })
    if (found) return found
  }
  return undefined
}

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches
      .open(CACHE)
      // allSettled: one missing file must not abort the whole precache.
      .then((cache) => Promise.allSettled(SHELL.map((url) => cache.add(url))))
      .then(() => self.skipWaiting()),
  )
})

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) => Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k))))
      .then(() => self.clients.claim()),
  )
})

self.addEventListener('fetch', (event) => {
  const { request } = event

  if (request.method !== 'GET') return

  const url = new URL(request.url)
  // Same-origin only: API calls and any third-party request are never cached here.
  if (url.origin !== self.location.origin) return

  if (request.mode === 'navigate') {
    event.respondWith(
      fetch(request)
        .then((response) => {
          const copy = response.clone()
          caches.open(CACHE).then((cache) => cache.put('/index.html', copy))
          return response
        })
        .catch(() =>
          lookup('/index.html')
            .then((hit) => hit || lookup('/'))
            .then((hit) => hit || lookup(request)),
        ),
    )
    return
  }

  event.respondWith(
    lookup(request).then(
      (hit) =>
        hit ||
        fetch(request).then((response) => {
          if (response.ok && response.type === 'basic') {
            const copy = response.clone()
            caches.open(CACHE).then((cache) => cache.put(request, copy))
          }
          return response
        }),
    ),
  )
})
