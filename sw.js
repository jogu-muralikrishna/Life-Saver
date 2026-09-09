const CACHE_NAME = 'lifesaver-pwa-v3';
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
  './certificate.html',
  './manifest.json',
  './icon.png',
  './cert-blood-clean.jpg',
  './cert-organ-clean.jpg'
];

// Install Event - Pre-cache core assets
self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => {
      console.log('[LifeSaver PWA v3] Caching core app shell & offline assets');
      return Promise.allSettled(
        ASSETS_TO_CACHE.map((url) => cache.add(url).catch(err => console.warn('[LifeSaver PWA] Cache add skipped:', url, err)))
      );
    }).then(() => self.skipWaiting())
  );
});

// Activate Event - Clean up old caches
self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((cacheNames) => {
      return Promise.all(
        cacheNames.map((cache) => {
          if (cache !== CACHE_NAME) {
            console.log('[LifeSaver PWA] Removing outdated cache:', cache);
            return caches.delete(cache);
          }
        })
      );
    }).then(() => self.clients.claim())
  );
});

// Fetch Event (Network first for dynamic, cache fallback for offline)
self.addEventListener('fetch', (event) => {
  if (event.request.method !== 'GET') return;

  const url = new URL(event.request.url);

  // Cross-origin assets (CDNs, icons, external fonts)
  if (!url.origin.includes(self.location.hostname)) {
    event.respondWith(
      caches.match(event.request).then((cached) => {
        return cached || fetch(event.request).then((response) => {
          if (response && response.status === 200) {
            const clone = response.clone();
            caches.open(CACHE_NAME).then((cache) => cache.put(event.request, clone));
          }
          return response;
        }).catch(() => cached || new Response('', { status: 408, statusText: 'Offline' }));
      })
    );
    return;
  }

  // Same-origin assets: Network-first with cache fallback
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
          // If HTML page request failed offline, fall back to index.html or emergency.html
          if (event.request.headers.get('accept')?.includes('text/html')) {
            return caches.match('./emergency.html') || caches.match('./index.html');
          }
        });
      })
  );
});
