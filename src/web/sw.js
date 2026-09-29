/**
 * Redacto — the web page's service worker (offline use)
 *
 * Serves the page from Cache Storage so it keeps working without a network:
 *
 * - The app itself (HTML, JS, CSS, fonts, the rules WASM, ONNX Runtime) is
 *   cached when the worker installs.
 * - The local AI model is large, so it is cached the first time the page
 *   loads it, or all at once when the page asks (`cache-models`).
 *
 * Only this site's own files pass through here; the text typed into the page
 * never does. The build (webpack.web.config.js) prepends `PRECACHE`: the file
 * lists and a hash of their contents, so a new build replaces the old caches.
 */

/* global PRECACHE */
const SHELL_CACHE = `pg-shell-${PRECACHE.shellHash}`;
const MODEL_CACHE = `pg-models-${PRECACHE.modelHash}`;
const scopeUrl = (path) => new URL(path, self.registration.scope).href;
const MODEL_URLS = new Set(PRECACHE.models.map(scopeUrl));

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches
      .open(SHELL_CACHE)
      .then((cache) => cache.addAll(['./', ...PRECACHE.shell].map(scopeUrl)))
      .then(() => self.skipWaiting()),
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((names) =>
        Promise.all(
          names
            .filter((name) => name.startsWith('pg-') && name !== SHELL_CACHE && name !== MODEL_CACHE)
            .map((name) => caches.delete(name)),
        ),
      )
      .then(() => self.clients.claim()),
  );
});

function withoutSearch(url) {
  const copy = new URL(url);
  copy.search = '';
  copy.hash = '';
  return copy.href;
}

async function cached(url) {
  return (await caches.open(SHELL_CACHE).then((c) => c.match(url))) ??
    (await caches.open(MODEL_CACHE).then((c) => c.match(url)));
}

async function respond(event) {
  const { request } = event;
  const url = request.mode === 'navigate' ? scopeUrl('./') : withoutSearch(request.url);
  const hit = await cached(url);
  if (hit) {
    // The model loader checks files with HEAD; answer it from the GET entry.
    return request.method === 'HEAD' ? new Response(null, { status: hit.status, headers: hit.headers }) : hit;
  }
  const response = await fetch(request);
  // Only whole files: the model loader probes files with a one-byte Range
  // request, whose 206 answer the cache cannot store.
  if (request.method === 'GET' && response.status === 200 && MODEL_URLS.has(url)) {
    // Stored alongside, so the (large) file reaches the page as it downloads.
    const copy = response.clone();
    event.waitUntil(caches.open(MODEL_CACHE).then((cache) => cache.put(url, copy)));
  }
  return response;
}

self.addEventListener('fetch', (event) => {
  const { request } = event;
  if (request.method !== 'GET' && request.method !== 'HEAD') return;
  if (!request.url.startsWith(self.registration.scope)) return;
  event.respondWith(respond(event));
});

async function modelStatus() {
  const cache = await caches.open(MODEL_CACHE);
  let done = 0;
  for (const url of MODEL_URLS) if (await cache.match(url)) done += 1;
  return { type: 'offline-status', modelFiles: MODEL_URLS.size, modelFilesCached: done };
}

async function cacheModels(client) {
  const cache = await caches.open(MODEL_CACHE);
  for (const url of MODEL_URLS) {
    if (await cache.match(url)) continue;
    const response = await fetch(url);
    if (!response.ok) throw new Error(`${url}: HTTP ${response.status}`);
    await cache.put(url, response);
    client?.postMessage(await modelStatus());
  }
}

self.addEventListener('message', (event) => {
  const client = event.source;
  const type = event.data?.type;
  if (type === 'offline-status') {
    event.waitUntil(modelStatus().then((status) => client?.postMessage(status)));
  } else if (type === 'cache-models') {
    event.waitUntil(
      cacheModels(client)
        .then(modelStatus)
        .then((status) => client?.postMessage(status))
        .catch(async (err) => client?.postMessage({ ...(await modelStatus()), error: String(err?.message ?? err) })),
    );
  }
});
