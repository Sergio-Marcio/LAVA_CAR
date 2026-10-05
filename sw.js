const CACHE_NAME = 'lavacar-pwa-v21';
const ASSETS_TO_CACHE = [
  './',
  './index.html',
  './offline.html',
  './manifest.webmanifest',
  './icons/icon.svg',
  './css/style.css',
  './js/core.js',
  './js/auth-utils.js',
  './js/auth.js',
  './js/db.js',
  './js/navigation.js',
  './js/placa.js',
  './js/wizard.js',
  './js/media.js',
  './js/checkin.js',
  './js/dashboard.js',
  './js/kanban.js',
  './js/services.js',
  './js/clients.js',
  './js/reports.js',
  './js/products.js',
  './js/main.js'
];

// Install Event
self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => {
      console.log('[Service Worker] Caching app shell');
      return cache.addAll(ASSETS_TO_CACHE).catch((err) => {
        console.warn('[Service Worker] Failed to cache some assets on install:', err);
      });
    })
  );
  self.skipWaiting();
});

// Activate Event
self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((cacheNames) => {
      return Promise.all(
        cacheNames.map((cache) => {
          if (cache !== CACHE_NAME) {
            console.log('[Service Worker] Clearing old cache:', cache);
            return caches.delete(cache);
          }
        })
      );
    })
  );
  self.clients.claim();
});

// Fetch Event
self.addEventListener('fetch', (event) => {
  // Only intercept GET requests
  if (event.request.method !== 'GET') return;

  event.respondWith(
    caches.match(event.request).then((cachedResponse) => {
      if (cachedResponse) {
        // Return cached version and update cache in background
        fetch(event.request).then((networkResponse) => {
          if (networkResponse && networkResponse.status === 200) {
            caches.open(CACHE_NAME).then((cache) => cache.put(event.request, networkResponse));
          }
        }).catch(() => {});
        return cachedResponse;
      }

      return fetch(event.request).then((networkResponse) => {
        if (!networkResponse) return networkResponse;
        if (networkResponse.status === 200 || networkResponse.type === 'opaque') {
          const responseToCache = networkResponse.clone();
          caches.open(CACHE_NAME).then((cache) => cache.put(event.request, responseToCache));
        }
        return networkResponse;
      }).catch(() => {
        // Fallback response for offline if HTML requested
        if (event.request.headers.get('accept')?.includes('text/html')) {
          return caches.match('./offline.html') || caches.match('./index.html');
        }
      });
    })
  );
});
