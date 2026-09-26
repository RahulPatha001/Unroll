/**
 * Service worker: offline shell.
 *
 * Deliberately minimal, because the failure mode of an over-eager service worker
 * is a user staring at a stale app with no way to tell. This one:
 *
 *  - **precaches the shell** on install, so a cold load works offline;
 *  - **network-first for navigations**, falling back to the cached shell. A deep
 *    link like `?algo=dijkstra&frame=812` must work offline, and it is a
 *    navigation, so the fallback is the shell rather than a 404;
 *  - **stale-while-revalidate for hashed assets**, which are immutable by
 *    construction, so serving a cached copy is always correct;
 *  - **never caches a non-200 or an opaque response**, so an error page cannot be
 *    pinned as if it were content.
 *
 * Dev builds are skipped entirely: Vite's HMR client and a cache have no useful
 * relationship, and a cached dev build is a debugging session nobody can escape.
 */

const VERSION = 'unroll-v2';
const SHELL = ['/', '/index.html', '/manifest.webmanifest', '/favicon.svg'];

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches
      .open(VERSION)
      .then((cache) => cache.addAll(SHELL))
      .then(() => self.skipWaiting())
      .catch(() => {
        // A missing shell entry must not block activation; the runtime handler
        // will fill it in on first successful navigation.
      }),
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) => Promise.all(keys.filter((k) => k !== VERSION).map((k) => caches.delete(k))))
      .then(() => self.clients.claim()),
  );
});

self.addEventListener('fetch', (event) => {
  const request = event.request;
  if (request.method !== 'GET') return;

  const url = new URL(request.url);
  if (url.origin !== self.location.origin) return;
  if (url.pathname.startsWith('/api/')) return;

  if (request.mode === 'navigate') {
    event.respondWith(
      fetch(request)
        .then((response) => {
          if (response.ok) {
            const copy = response.clone();
            void caches.open(VERSION).then((c) => c.put('/index.html', copy));
          }
          return response;
        })
        .catch(() => caches.match('/index.html').then((r) => r ?? Response.error())),
    );
    return;
  }

  // Hashed build output: immutable, so serve the cache and refresh in the
  // background. Everything else falls through to the network untouched.
  if (!/\/assets\/.*-[A-Za-z0-9_-]{8,}\.(js|css|woff2?|svg|png|webp)$/.test(url.pathname)) return;

  event.respondWith(
    caches.open(VERSION).then(async (cache) => {
      const hit = await cache.match(request);
      const network = fetch(request)
        .then((response) => {
          if (response.ok) void cache.put(request, response.clone());
          return response;
        })
        .catch(() => hit ?? Response.error());
      return hit ?? network;
    }),
  );
});
