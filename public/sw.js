/*
 * Service worker mínimo. Existe por dos motivos:
 *  1. Chrome no ofrece instalar la app si no hay uno con manejador de fetch.
 *  2. Los libros ya viven en el dispositivo, así que la app tiene que abrir
 *     sin conexión. Lo único que necesita internet es buscar una palabra.
 *
 * Al cambiar VERSION se descartan los caches viejos: si un deploy rompe algo,
 * el siguiente se cura solo.
 */
const VERSION = "v1";
const SHELL_CACHE = `lectura-shell-${VERSION}`;
const ASSET_CACHE = `lectura-assets-${VERSION}`;

const SHELL_ROUTES = ["/", "/mis-palabras", "/ajustes"];

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches
      .open(SHELL_CACHE)
      .then((cache) => cache.addAll(SHELL_ROUTES))
      .catch(() => {
        // Si alguna ruta falla no se aborta la instalación: el worker sigue
        // sirviendo desde la red y cachea a medida que se navega.
      })
      .then(() => self.skipWaiting()),
  );
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) =>
        Promise.all(
          keys
            .filter((key) => key !== SHELL_CACHE && key !== ASSET_CACHE)
            .map((key) => caches.delete(key)),
        ),
      )
      .then(() => self.clients.claim()),
  );
});

self.addEventListener("fetch", (event) => {
  const { request } = event;
  if (request.method !== "GET") return;

  const url = new URL(request.url);

  // Diccionario, traducción y audios: siempre de la red, nunca cacheados acá.
  // El resultado ya se guarda en IndexedDB, que es donde corresponde.
  if (url.origin !== self.location.origin) return;

  // Los assets con hash de Next son inmutables: cache primero.
  if (url.pathname.startsWith("/_next/static/") || url.pathname === "/pdf.worker.min.mjs") {
    event.respondWith(cacheFirst(request, ASSET_CACHE));
    return;
  }

  // Páginas: red primero para no servir una versión vieja, con el cache como
  // red de contención cuando no hay señal.
  if (request.mode === "navigate") {
    event.respondWith(networkFirst(request, SHELL_CACHE));
    return;
  }

  if (["style", "script", "image", "font"].includes(request.destination)) {
    event.respondWith(cacheFirst(request, ASSET_CACHE));
  }
});

async function cacheFirst(request, cacheName) {
  const cached = await caches.match(request);
  if (cached) return cached;

  const response = await fetch(request);
  if (response.ok) {
    const cache = await caches.open(cacheName);
    void cache.put(request, response.clone());
  }
  return response;
}

async function networkFirst(request, cacheName) {
  try {
    const response = await fetch(request);
    if (response.ok) {
      const cache = await caches.open(cacheName);
      void cache.put(request, response.clone());
    }
    return response;
  } catch (error) {
    const cached = (await caches.match(request)) ?? (await caches.match("/"));
    if (cached) return cached;
    throw error;
  }
}
