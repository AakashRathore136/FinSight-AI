/* eslint-disable @typescript-eslint/no-explicit-any, @typescript-eslint/no-unused-vars, react-hooks/rules-of-hooks, react-hooks/exhaustive-deps, react-hooks/immutability, react-hooks/purity, react-hooks/refs, react-hooks/set-state-in-effect */
const CACHE_VERSION = 'v3';
const STATIC_CACHE = `static-${CACHE_VERSION}`;
const API_CACHE = `api-${CACHE_VERSION}`;
const OFFLINE_CACHE = `offline-${CACHE_VERSION}`;

const STATIC_ASSETS = [
  '/',
  '/index.html',
  '/offline.html',
  '/logo.png',
];

const API_PATTERNS = [
  /\/api\//,
];

// Only public, unauthenticated endpoints may ever be cached. Everything else
// under /api/ returns user-specific data or short-lived signed URLs and must
// stay out of the cache.
const PUBLIC_API_PATTERN = /^\/api\/health/;

const OFFLINE_PATHS = ['/'];

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(STATIC_CACHE)
      .then(cache => cache.addAll(STATIC_ASSETS))
      .then(() => self.skipWaiting())
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then(keys => {
      return Promise.all(
        keys.filter(key => !key.includes(CACHE_VERSION))
          .map(key => caches.delete(key))
      );
    }).then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', (event) => {
  const { request } = event;
  const url = new URL(request.url);

  if (API_PATTERNS.some(pattern => pattern.test(url.pathname))) {
    event.respondWith(handleApiRequest(request));
    return;
  }

  if (request.method === 'GET') {
    event.respondWith(handleStaticRequest(request));
  }
});

async function handleStaticRequest(request) {
  try {
    const cache = await caches.open(STATIC_CACHE);
    const cached = await cache.match(request);
    if (cached) return cached;

    const response = await fetch(request);
    if (response.ok) {
      cache.put(request, response.clone());
    }
    return response;
  } catch {
    if (OFFLINE_PATHS.some(path => request.url.endsWith(path))) {
      return caches.match('/offline.html');
    }
    return new Response('Offline', { status: 503 });
  }
}

async function handleApiRequest(request) {
  try {
    const response = await fetch(request.clone());
    // Only cache public GET responses without credentials. Authenticated
    // responses (per-user data, signed document URLs) must never be stored:
    // they are session-bound and could leak to another user.
    if (
      response.ok &&
      request.method === 'GET' &&
      request.headers.get('Authorization') == null &&
      PUBLIC_API_PATTERN.test(new URL(request.url).pathname)
    ) {
      const cache = await caches.open(API_CACHE);
      cache.put(request, response.clone());
    }
    return response;
  } catch {
    // Never serve a stale cached copy for authenticated or sensitive
    // requests — the cached entry may belong to another account.
    const url = new URL(request.url);
    const isSafeToServeFromCache =
      request.method === 'GET' &&
      request.headers.get('Authorization') == null &&
      PUBLIC_API_PATTERN.test(url.pathname);

    if (isSafeToServeFromCache) {
      const cached = await caches.match(request);
      if (cached) return cached;
    }

    return new Response(
      JSON.stringify({ error: 'Offline', message: 'No cached data available' }),
      { status: 503, headers: { 'Content-Type': 'application/json' } }
    );
  }
}

const pendingSync = new Map();

self.addEventListener('sync', (event) => {
  if (event.tag === 'sync-pending-requests') {
    event.waitUntil(processPendingSync());
  }
});

async function processPendingSync() {
  for (const [id, requestData] of pendingSync.entries()) {
    try {
      const response = await fetch(requestData.url, {
        method: requestData.method,
        headers: requestData.headers,
        body: requestData.body,
      });
      if (response.ok) {
        pendingSync.delete(id);
      }
    } catch {
      break;
    }
  }
}

self.addEventListener('message', (event) => {
  const { type, payload } = event.data;

  switch (type) {
    case 'SKIP_WAITING':
      self.skipWaiting();
      break;
    case 'CACHE_URLS':
      caches.open(STATIC_CACHE)
        .then(cache => cache.addAll(payload.urls));
      break;
    case 'STORE_PENDING_REQUEST':
      pendingSync.set(payload.id, payload);
      self.registration.sync.register('sync-pending-requests');
      break;
    case 'CLEAR_API_CACHE':
      // Purge every cached API response on sign-out so session-bound data
      // cannot survive into the next user's session.
      caches.delete(API_CACHE);
      break;
    default:
      break;
  }
});
