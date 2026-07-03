// RabbiRabbit Service Worker
// v2 — network-first for app files so deploys reach users immediately.
// Cache is the fallback (offline), not the primary source.
// Study generation always requires network (API call).

// BUMP THIS on every deploy that changes app files (v3, v4, ...).
// Changing this string forces all clients to rebuild their cache.
const CACHE_NAME = 'rabbirabbit-v2'

// App shell files to pre-cache on install (offline fallback)
const SHELL_FILES = [
  '/',
  '/index.html',
  '/manifest.json',
  '/icons/icon-192x192.png',
  '/icons/icon-512x512.png',
  '/icons/apple-touch-icon.png',
]

// Install — cache app shell, take over immediately
self.addEventListener('install', event => {
  event.waitUntil(
    caches.open(CACHE_NAME).then(cache => cache.addAll(SHELL_FILES))
  )
  self.skipWaiting()
})

// Activate — delete every cache that isn't the current version
self.addEventListener('activate', event => {
  event.waitUntil(
    caches.keys().then(keys =>
      Promise.all(
        keys
          .filter(key => key !== CACHE_NAME)
          .map(key => caches.delete(key))
      )
    )
  )
  self.clients.claim()
})

// Fetch strategy:
// - API calls: never intercepted, straight to network
// - Navigations + JS/CSS: NETWORK FIRST, cache fallback (fresh code wins)
// - Images/icons/fonts: cache first (they rarely change, saves bandwidth)
self.addEventListener('fetch', event => {
  const url = new URL(event.request.url)

  // Never intercept API calls — always go to network
  if (url.hostname.includes('workers.dev') ||
      url.hostname.includes('anthropic.com') ||
      url.hostname.includes('githubusercontent.com')) {
    return
  }

  const isNavigation = event.request.mode === 'navigate'
  const isAppCode = /\.(js|css|html)$/.test(url.pathname) || url.pathname === '/'

  if (isNavigation || isAppCode) {
    // NETWORK FIRST — always try to get the latest deploy
    event.respondWith(
      fetch(event.request)
        .then(response => {
          if (event.request.method === 'GET' && response.status === 200) {
            const clone = response.clone()
            caches.open(CACHE_NAME).then(cache => cache.put(event.request, clone))
          }
          return response
        })
        .catch(() => {
          // Offline — serve from cache
          return caches.match(event.request).then(cached => {
            if (cached) return cached
            if (isNavigation) return caches.match('/index.html')
          })
        })
    )
    return
  }

  // Everything else (images, icons, fonts): CACHE FIRST
  event.respondWith(
    caches.match(event.request).then(cached => {
      if (cached) return cached
      return fetch(event.request).then(response => {
        if (event.request.method === 'GET' && response.status === 200) {
          const clone = response.clone()
          caches.open(CACHE_NAME).then(cache => cache.put(event.request, clone))
        }
        return response
      }).catch(() => {
        if (event.request.mode === 'navigate') {
          return caches.match('/index.html')
        }
      })
    })
  )
})
