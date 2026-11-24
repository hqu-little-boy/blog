/**
 * Pyodide WebAssembly & Static Assets Service Worker
 * Implements Cache-First (CacheStorage) strong caching strategy.
 */

const CACHE_NAME = "pyodide-cache-v1";

const PYODIDE_CORE_ASSETS = [
  "/vendor/pyodide/pyodide.js",
  "/vendor/pyodide/pyodide.asm.js",
  "/vendor/pyodide/pyodide.asm.wasm",
  "/vendor/pyodide/python_stdlib.zip",
  "/vendor/pyodide/pyodide-lock.json",
  "/vendor/pyodide/pyodide.mjs",
];

// Helper to determine if a request belongs to Pyodide
function isPyodideRequest(url) {
  // Local project vendor assets
  if (url.pathname.includes("/vendor/pyodide/")) {
    return true;
  }
  // CDN fallback assets (jsdelivr Pyodide or wheels)
  if (
    url.hostname === "cdn.jsdelivr.net" &&
    url.pathname.includes("/pyodide/")
  ) {
    return true;
  }
  return false;
}

self.addEventListener("install", () => {
  // Activate immediately without waiting for existing tabs to close
  self.skipWaiting();
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) =>
        Promise.all(
          keys.map((key) => {
            if (key !== CACHE_NAME) {
              return caches.delete(key);
            }
          })
        )
      )
      .then(() => self.clients.claim())
  );
});

self.addEventListener("fetch", (event) => {
  const url = new URL(event.request.url);

  // Only intercept Pyodide runtime assets; let all blog pages, APIs, and styles pass through normally
  if (!isPyodideRequest(url) || event.request.method !== "GET") {
    return;
  }

  // Cache-First (强缓存) Strategy
  event.respondWith(
    caches.open(CACHE_NAME).then(async (cache) => {
      const cachedResponse = await cache.match(event.request);
      if (cachedResponse) {
        return cachedResponse;
      }

      try {
        const networkResponse = await fetch(event.request);
        // Cache successful responses or opaque cross-origin requests
        if (
          networkResponse &&
          (networkResponse.status === 200 || networkResponse.type === "opaque")
        ) {
          cache.put(event.request, networkResponse.clone());
        }
        return networkResponse;
      } catch (err) {
        // If local request fails, let the client engine attempt CDN fallback
        throw err;
      }
    })
  );
});

// Proactive pre-warming triggered by client when Python code blocks are detected
self.addEventListener("message", (event) => {
  if (event.data && event.data.type === "PRECACHE_PYODIDE") {
    event.waitUntil(
      caches.open(CACHE_NAME).then(async (cache) => {
        for (const assetPath of PYODIDE_CORE_ASSETS) {
          try {
            const match = await cache.match(assetPath);
            if (!match) {
              const res = await fetch(assetPath);
              if (res && res.ok) {
                await cache.put(assetPath, res);
              }
            }
          } catch {
            // Ignore pre-fetch failures silently
          }
        }
      })
    );
  }
});
