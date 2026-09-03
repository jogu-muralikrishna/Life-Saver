const CACHE_NAME = 'lifesaver-pwa-v2';
const ASSETS_TO_CACHE = [
  './',
  './index.html',
  './index.css',
  './emergency.html',
  './blood.html',
  './organ.html',
  './find-donor.html',
  './register-donor.html',
  './organ-donor.html',
  './hospitals.html',
  './ambulance.html',
  './auth.html',
  './manifest.json'
];

// Install Event
self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => {
      console.log('[LifeSaver PWA] Caching core app shell');
      return Promise.allSettled(
        ASSETS_TO_CACHE.map((url) => cache.add(url).catch(err => console.warn('[LifeSaver PWA] Cache add skipped:', url, err)))
      );
    }).then(() => self.skipWaiting())
  );
});

// Activate Event
self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((cacheNames) => {
      return Promise.all(
        cacheNames.map((cache) => {
          if (cache !== CACHE_NAME) {
            console.log('[LifeSaver PWA] Clearing old cache:', cache);
            return caches.delete(cache);
          }
        })
      );
    }).then(() => self.clients.claim())
  );
});

// Fetch Event (Network First with Cache Fallback)
self.addEventListener('fetch', (event) => {
  if (event.request.method !== 'GET') return;

  // Ignore cross-origin requests like Firebase SDK / CDN if offline
  if (!event.request.url.startsWith(self.location.origin)) {
    event.respondWith(
      fetch(event.request).catch(() => {
        return caches.match(event.request);
      })
    );
    return;
  }

  event.respondWith(
    fetch(event.request)
      .then((response) => {
        if (response && response.status === 200) {
          const responseClone = response.clone();
          caches.open(CACHE_NAME).then((cache) => {
            cache.put(event.request, responseClone);
          });
        }
        return response;
      })
      .catch(() => {
        return caches.match(event.request).then((cachedResponse) => {
          if (cachedResponse) return cachedResponse;
          if (event.request.headers.get('accept')?.includes('text/html')) {
            return caches.match('./index.html');
          }
        });
      })
  );
});
