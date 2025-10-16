// SwiftList Service Worker with offline fallback
// Increment this when changing caching logic
const CACHE_NAME = 'swiftlist-cache-v3';
const RUNTIME_CACHE = 'swiftlist-runtime-v1';

// Cache these app shell assets on install
const ASSETS_TO_CACHE = [
  '/',
  '/index.html',
  '/style.css',
  '/script.js',
  '/manifest.webmanifest',
  '/offline.html',
  // Icons if present (safe to include even if missing)
  '/icons/icon-192.png',
  '/icons/icon-512.png'
];

// Helpers to decide what to cache
const isNavigationRequest = (request) => {
  return request.mode === 'navigate' ||
         (request.method === 'GET' &&
          request.headers.get('accept') &&
          request.headers.get('accept').includes('text/html'));
};

// Don’t cache dynamic Firebase/RTDB requests
const shouldBypassCache = (url) => {
  const u = typeof url === 'string' ? new URL(url, self.location.origin) : new URL(url.url);
  const host = u.hostname;
  // Allow fonts and static CDNs; bypass RTDB and Google APIs calls
  if (host.endsWith('firebaseio.com') || host.endsWith('googleapis.com')) return true;
  // Let everything else be cacheable if desired
  return false;
};

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => cache.addAll(ASSETS_TO_CACHE)).catch(() => void 0)
  );
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    (async () => {
      const keys = await caches.keys();
      await Promise.all(
        keys
          .filter((k) => k !== CACHE_NAME && k !== RUNTIME_CACHE)
          .map((k) => caches.delete(k))
      );
      await self.clients.claim();
    })()
  );
});

// Strategy:
// - Ignore non-http(s) requests (e.g., chrome-extension://)
// - HTML navigations: network-first, fallback to cache, then offline.html
// - Static assets (css/js/img/font): cache-first, update in background (same-origin only)
// - Bypass caching for firebase/googleapis dynamic requests
self.addEventListener('fetch', (event) => {
  const { request } = event;

  // Only handle GET
  if (request.method !== 'GET') return;

  // Only handle http(s) schemes; ignore browser/extension protocols
  const reqUrl = new URL(request.url);
  if (reqUrl.protocol !== 'http:' && reqUrl.protocol !== 'https:') return;

  // Navigations (HTML pages)
  if (isNavigationRequest(request)) {
    event.respondWith(
      (async () => {
        try {
          const fresh = await fetch(request);
          const cache = await caches.open(CACHE_NAME);
          // put a copy of index.html navigations (same-origin) into cache
          if (fresh.ok && fresh.type === 'basic') {
            try { await cache.put('/', fresh.clone()); } catch (_) {}
          }
          return fresh;
        } catch (err) {
          // Try cached page, else offline fallback
          const cache = await caches.open(CACHE_NAME);
          const cached = await cache.match(request, { ignoreSearch: true }) ||
                         await cache.match('/index.html') ||
                         await cache.match('/offline.html');
          if (cached) return cached;
          return new Response('Offline', { status: 503, headers: { 'Content-Type': 'text/plain' } });
        }
      })()
    );
    return;
  }

  // Skip caching for dynamic endpoints (e.g., Realtime Database)
  if (shouldBypassCache(request.url)) {
    event.respondWith(fetch(request).catch(async () => {
      // if offline, try to serve any cached version
      const cache = await caches.open(RUNTIME_CACHE);
      const cached = await cache.match(request);
      return cached || new Response('', { status: 504 });
    }));
    return;
  }

  // Static assets: cache-first, then network (only cache same-origin/basic responses)
  const destination = request.destination; // 'style', 'script', 'image', 'font', etc.
  if (['style', 'script', 'image', 'font'].includes(destination) || request.url.endsWith('.css') || request.url.endsWith('.js')) {
    event.respondWith(
      (async () => {
        const cache = await caches.open(RUNTIME_CACHE);
        const cached = await cache.match(request);
        if (cached) {
          // Update in background (stale-while-revalidate)
          event.waitUntil(
            fetch(request).then((res) => {
              if (res && res.ok && res.type === 'basic' && new URL(request.url).origin === self.location.origin) {
                try { cache.put(request, res.clone()); } catch (_) {}
              }
            }).catch(() => void 0)
          );
          return cached;
        }
        try {
          const res = await fetch(request);
          if (res && res.ok && res.type === 'basic' && new URL(request.url).origin === self.location.origin) {
            try { await cache.put(request, res.clone()); } catch (_) {}
          }
          return res;
        } catch (err) {
          // If we can’t fetch and no cache, fall back to offline page for HTML-like requests only
          const shell = await caches.open(CACHE_NAME);
          return destination === '' ? (await shell.match('/offline.html')) : new Response('', { status: 504 });
        }
      })()
    );
    return;
  }

  // Default: network-first with cache fallback (same-origin/basic only)
  event.respondWith(
    (async () => {
      try {
        const res = await fetch(request);
        const cache = await caches.open(RUNTIME_CACHE);
        if (res && res.ok && res.type === 'basic' && new URL(request.url).origin === self.location.origin) {
          try { await cache.put(request, res.clone()); } catch (_) {}
        }
        return res;
      } catch (err) {
        const cache = await caches.open(RUNTIME_CACHE);
        const cached = await cache.match(request);
        return cached || new Response('', { status: 504 });
      }
    })()
  );
});

// Optional: allow page to trigger skipWaiting
self.addEventListener('message', (event) => {
  if (event.data === 'SKIP_WAITING') self.skipWaiting();
});