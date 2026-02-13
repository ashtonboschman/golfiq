const SW_VERSION = new URL(self.location.href).searchParams.get('v') || 'dev';
const CACHE_PREFIX = 'golfiq';
const STATIC_CACHE = `${CACHE_PREFIX}-static-v${SW_VERSION}`;
const PAGE_CACHE = `${CACHE_PREFIX}-pages-v${SW_VERSION}`;
const OFFLINE_URL = '/offline.html';

const PUBLIC_NAV_ROUTES = new Set([
  '/',
  '/about',
  '/contact',
  '/privacy',
  '/terms',
  '/pricing',
  '/login',
  '/forgot-password',
  '/reset-password',
  '/waitlist-confirm',
]);

const STATIC_DESTINATIONS = new Set(['style', 'script', 'image', 'font']);

const PRECACHE_URLS = [
  OFFLINE_URL,
  '/manifest.json',
  '/logos/favicon/golfiq-icon-192.png',
  '/logos/favicon/golfiq-icon-512.png',
];

self.addEventListener('install', (event) => {
  event.waitUntil(
    (async () => {
      const cache = await caches.open(STATIC_CACHE);
      await Promise.all(
        PRECACHE_URLS.map(async (url) => {
          try {
            const response = await fetch(url, { cache: 'no-store' });
            if (response && response.ok) {
              await cache.put(url, response.clone());
            }
          } catch {
            // Keep install resilient; fallback still works if OFFLINE_URL is cached.
          }
        }),
      );
      await self.skipWaiting();
    })(),
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    (async () => {
      const names = await caches.keys();
      await Promise.all(
        names.map((name) => {
          const isGolfiqCache = name.startsWith(`${CACHE_PREFIX}-`);
          const isCurrent = name === STATIC_CACHE || name === PAGE_CACHE;
          if (isGolfiqCache && !isCurrent) return caches.delete(name);
          return Promise.resolve(false);
        }),
      );
      await self.clients.claim();
    })(),
  );
});

self.addEventListener('message', (event) => {
  if (event.data && event.data.type === 'SKIP_WAITING') {
    self.skipWaiting();
  }
});

self.addEventListener('fetch', (event) => {
  const request = event.request;
  if (request.method !== 'GET') return;

  const url = new URL(request.url);

  if (url.origin !== self.location.origin) return;

  if (request.mode === 'navigate') {
    event.respondWith(handleNavigationRequest(request, url));
    return;
  }

  if (isSensitiveRequest(request, url)) {
    event.respondWith(fetch(request));
    return;
  }

  if (STATIC_DESTINATIONS.has(request.destination)) {
    event.respondWith(staleWhileRevalidate(request));
  }
});

function isSensitiveRequest(request, url) {
  if (url.pathname.startsWith('/api/')) return true;
  if (url.pathname.startsWith('/api/auth/')) return true;
  if (url.pathname.startsWith('/api/stripe/')) return true;
  if (url.pathname.startsWith('/subscription/success')) return true;
  if (request.cache === 'no-store') return true;
  if (request.credentials === 'include') return true;
  if (request.headers.has('authorization')) return true;
  return false;
}

async function handleNavigationRequest(request, url) {
  const isPublicRoute = PUBLIC_NAV_ROUTES.has(url.pathname);

  if (!isPublicRoute) {
    try {
      return await fetch(request);
    } catch {
      return (await caches.match(OFFLINE_URL)) || Response.error();
    }
  }

  try {
    const networkResponse = await fetch(request);
    if (networkResponse && networkResponse.ok) {
      const cache = await caches.open(PAGE_CACHE);
      cache.put(request, networkResponse.clone());
    }
    return networkResponse;
  } catch {
    const cachedResponse = await caches.match(request);
    if (cachedResponse) return cachedResponse;
    return (await caches.match(OFFLINE_URL)) || Response.error();
  }
}

async function staleWhileRevalidate(request) {
  const cache = await caches.open(STATIC_CACHE);
  const cachedResponse = await cache.match(request);

  const networkFetch = fetch(request)
    .then((networkResponse) => {
      if (networkResponse && networkResponse.ok) {
        cache.put(request, networkResponse.clone());
      }
      return networkResponse;
    })
    .catch(() => undefined);

  if (cachedResponse) {
    return cachedResponse;
  }

  const networkResponse = await networkFetch;
  return networkResponse || Response.error();
}
