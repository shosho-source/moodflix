// MoodFlix PWA Service Worker (Cache-First for Images, Network-First for Shell & Assets)
const CACHE_NAME = 'moodflix-v6-resilient';

self.addEventListener('install', (event) => {
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((keys) => {
      return Promise.all(
        keys.filter((key) => key !== CACHE_NAME).map((key) => caches.delete(key))
      );
    })
  );
  self.clients.claim();
});

self.addEventListener('fetch', (event) => {
  // Exclude API requests, streaming routes, websockets, and browser extensions across Chrome, Safari, Firefox
  if (
    event.request.method !== 'GET' ||
    !event.request.url.startsWith('http') ||
    event.request.url.includes('/api/') ||
    event.request.url.startsWith('chrome-extension') ||
    event.request.url.startsWith('safari-web-extension') ||
    event.request.url.startsWith('moz-extension')
  ) {
    return;
  }

  const url = event.request.url;
  const isImage = url.includes('image.tmdb.org') || event.request.destination === 'image';

  if (isImage) {
    // Cache-first strategy for media posters and backdrops
    event.respondWith(
      caches.match(event.request).then((cachedResponse) => {
        if (cachedResponse) return cachedResponse;
        return fetch(event.request).then((response) => {
          if (response && response.status === 200 && (response.type === 'basic' || response.type === 'cors')) {
            const clone = response.clone();
            caches.open(CACHE_NAME).then((cache) => cache.put(event.request, clone)).catch(() => {});
          }
          return response;
        });
      })
    );
    return;
  }

  // Network-first strategy for application shell and static assets
  event.respondWith(
    fetch(event.request)
      .then((response) => {
        if (response && response.status === 200 && (response.type === 'basic' || response.type === 'cors')) {
          const responseToCache = response.clone();
          caches.open(CACHE_NAME).then((cache) => {
            cache.put(event.request, responseToCache);
          }).catch(() => {});
        }
        return response;
      })
      .catch(() => caches.match(event.request))
  );
});
