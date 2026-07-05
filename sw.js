// ═══════════════════════════════════════
// Learn AI - with Mateen · Service Worker
// ═══════════════════════════════════════

const CACHE_NAME = 'learnaiwm-v1';

// Resources to pre-cache on install
const PRECACHE_URLS = [
  './',
  './index.html',
  './manifest.json',
  'https://fonts.googleapis.com/css2?family=Poppins:wght@400;600;700&family=Inter:wght@400;500&display=swap',
  'https://cdnjs.cloudflare.com/ajax/libs/font-awesome/6.5.1/css/all.min.css'
];

// ─── INSTALL ────────────────────────
self.addEventListener('install', event => {
  console.log('[SW] Installing service worker...');
  event.waitUntil(
    caches.open(CACHE_NAME)
      .then(cache => {
        console.log('[SW] Pre-caching app shell');
        return cache.addAll(PRECACHE_URLS);
      })
      .then(() => self.skipWaiting())
      .catch(err => {
        console.warn('[SW] Pre-cache failed for some resources:', err);
        // Don't block install if CDN resources fail
        return caches.open(CACHE_NAME)
          .then(cache => cache.addAll(['./', './index.html', './manifest.json']));
      })
  );
});

// ─── ACTIVATE ───────────────────────
self.addEventListener('activate', event => {
  console.log('[SW] Activating service worker...');
  event.waitUntil(
    caches.keys().then(cacheNames => {
      return Promise.all(
        cacheNames
          .filter(name => name !== CACHE_NAME)
          .map(name => {
            console.log('[SW] Deleting old cache:', name);
            return caches.delete(name);
          })
      );
    }).then(() => self.clients.claim())
  );
});

// ─── FETCH — Network-first for HTML/API, Cache-first for assets ──
self.addEventListener('fetch', event => {
  const url = new URL(event.request.url);

  // Skip non-GET requests
  if (event.request.method !== 'GET') return;

  // Skip chrome-extension, jsonbin API calls, and groq API calls
  if (url.protocol === 'chrome-extension:' ||
      url.hostname === 'api.jsonbin.io' ||
      url.hostname === 'api.groq.com') {
    return;
  }

  // For navigation requests (HTML pages) — Network first, fallback to cache
  if (event.request.mode === 'navigate') {
    event.respondWith(
      fetch(event.request)
        .then(response => {
          // Cache the latest version
          const responseClone = response.clone();
          caches.open(CACHE_NAME).then(cache => cache.put(event.request, responseClone));
          return response;
        })
        .catch(() => {
          // Offline — serve from cache
          return caches.match(event.request)
            .then(cached => cached || caches.match('./index.html'));
        })
    );
    return;
  }

  // For CDN resources (fonts, icons) — Cache first, fallback to network
  if (url.hostname.includes('googleapis.com') ||
      url.hostname.includes('gstatic.com') ||
      url.hostname.includes('cdnjs.cloudflare.com') ||
      url.hostname.includes('fontawesome.com')) {
    event.respondWith(
      caches.match(event.request)
        .then(cached => {
          if (cached) return cached;
          return fetch(event.request)
            .then(response => {
              if (response.ok) {
                const responseClone = response.clone();
                caches.open(CACHE_NAME).then(cache => cache.put(event.request, responseClone));
              }
              return response;
            })
            .catch(() => {
              // For font files, return nothing gracefully
              return new Response('', { status: 200, statusText: 'Offline' });
            });
        })
    );
    return;
  }

  // For everything else — Stale while revalidate
  event.respondWith(
    caches.match(event.request)
      .then(cached => {
        const fetchPromise = fetch(event.request)
          .then(response => {
            if (response.ok) {
              const responseClone = response.clone();
              caches.open(CACHE_NAME).then(cache => cache.put(event.request, responseClone));
            }
            return response;
          })
          .catch(() => cached);
        return cached || fetchPromise;
      })
  );
});

// ─── PUSH NOTIFICATION (future-ready) ──
self.addEventListener('push', event => {
  if (!event.data) return;
  const data = event.data.json();
  event.waitUntil(
    self.registration.showNotification(data.title || 'Learn AI', {
      body: data.body || 'You have a new update!',
      icon: 'data:image/svg+xml,<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 192 192"><rect width="192" height="192" rx="30" fill="%231E3A8A"/><text x="96" y="145" font-size="128" text-anchor="middle">🤖</text></svg>',
      badge: 'data:image/svg+xml,<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 96 96"><rect width="96" height="96" rx="16" fill="%231E3A8A"/><text x="48" y="72" font-size="60" text-anchor="middle">🤖</text></svg>',
      vibrate: [100, 50, 100],
      data: { url: data.url || './' }
    })
  );
});

// ─── NOTIFICATION CLICK ─────────────
self.addEventListener('notificationclick', event => {
  event.notification.close();
  event.waitUntil(
    clients.matchAll({ type: 'window', includeUncontrolled: true })
      .then(clientList => {
        for (const client of clientList) {
          if (client.url.includes('index.html') && 'focus' in client) {
            return client.focus();
          }
        }
        return clients.openWindow(event.notification.data?.url || './');
      })
  );
});

// ─── BACKGROUND SYNC (future-ready) ──
self.addEventListener('sync', event => {
  if (event.tag === 'sync-data') {
    console.log('[SW] Background sync triggered');
    // Future: trigger data sync here
  }
});

console.log('[SW] Service worker loaded ✅');
