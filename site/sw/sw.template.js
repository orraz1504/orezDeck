/*
 * Service worker: makes the app open without reception.
 * Built by vite.config.ts (serviceWorker plugin), which fills in VERSION and PRECACHE.
 *
 * - App files (hashed JS/CSS/fonts/icons) are precached at install and served cache-first.
 * - Page loads are network-first (3 s timeout), falling back to the cached index.html,
 *   so a deploy shows up on the next online load and offline still works.
 * - Nothing cross-origin is touched: Firebase / Google sign-in always go to the network.
 * - A new version waits until the page asks it to take over (the "new version" chip).
 */
const VERSION = '__VERSION__'
const PRECACHE = __PRECACHE__
const CACHE = `orezdeck-${VERSION}`
const RUNTIME = 'orezdeck-runtime'
const INDEX = new URL('index.html', self.registration.scope).href

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE).then((cache) => cache.addAll(PRECACHE.map((url) => new Request(url, { cache: 'reload' })))),
  )
})

self.addEventListener('activate', (event) => {
  event.waitUntil(
    (async () => {
      for (const key of await caches.keys()) {
        if (key.startsWith('orezdeck-') && key !== CACHE && key !== RUNTIME) await caches.delete(key)
      }
      await self.clients.claim()
    })(),
  )
})

self.addEventListener('message', (event) => {
  if (event.data && event.data.type === 'SKIP_WAITING') self.skipWaiting()
})

const timeout = (ms) => new Promise((_, reject) => setTimeout(() => reject(new Error('timeout')), ms))

async function page(request) {
  try {
    const res = await Promise.race([fetch(request), timeout(3000)])
    if (res.ok) {
      const cache = await caches.open(CACHE)
      await cache.put(INDEX, res.clone())
    }
    return res
  } catch {
    const cached = await caches.match(INDEX, { ignoreVary: true })
    return cached || Response.error()
  }
}

async function asset(request) {
  // ignoreVary: module scripts send an Origin header, which a "Vary" response header would make a cache miss.
  const cached = await caches.match(request, { ignoreSearch: true, ignoreVary: true })
  if (cached) return cached
  const res = await fetch(request)
  if (res.ok && res.type === 'basic') {
    const cache = await caches.open(RUNTIME)
    cache.put(request, res.clone())
  }
  return res
}

self.addEventListener('fetch', (event) => {
  const { request } = event
  if (request.method !== 'GET') return
  const url = new URL(request.url)
  if (url.origin !== self.location.origin || !url.href.startsWith(self.registration.scope)) return
  if (request.mode === 'navigate') event.respondWith(page(request))
  else event.respondWith(asset(request))
})
