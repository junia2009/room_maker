const CACHE_NAME = 'room-maker-v10';
const ASSETS = [
  './',
  './index.html',
  './style.css',
  './app.js',
  './js/constants.js',
  './js/utils.js',
  './js/state-manager.js',
  './js/project-store.js',
  './js/floorplan-2d.js',
  './js/room-scene-3d.js',
  './js/editor-controller.js',
  './js/project-controller.js',
  './js/room-maker-app.js',
  './manifest.json',
  './icons/icon-192.png',
  './icons/icon-512.png',
];

self.addEventListener('install', e => {
  e.waitUntil(
    caches.open(CACHE_NAME).then(cache => cache.addAll(ASSETS))
  );
  self.skipWaiting();
});

self.addEventListener('activate', e => {
  e.waitUntil(
    caches.keys().then(keys =>
      Promise.all(keys.filter(k => k !== CACHE_NAME).map(k => caches.delete(k)))
    )
  );
  self.clients.claim();
});

self.addEventListener('fetch', e => {
  // CDN requests (Three.js) — network first, then cache
  if (e.request.url.includes('cdn.jsdelivr.net') || e.request.url.includes('unpkg.com')) {
    e.respondWith(
      fetch(e.request)
        .then(res => {
          const clone = res.clone();
          caches.open(CACHE_NAME).then(cache => cache.put(e.request, clone));
          return res;
        })
        .catch(() => caches.match(e.request))
    );
    return;
  }

  // Local assets — cache first, then network
  e.respondWith(
    caches.match(e.request).then(cached => {
      if (cached) return cached;
      return fetch(e.request).then(res => {
        const clone = res.clone();
        caches.open(CACHE_NAME).then(cache => cache.put(e.request, clone));
        return res;
      });
    })
  );
});
