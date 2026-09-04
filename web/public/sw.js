/*
 * Service worker Horus Assurances Digital.
 *
 * Rôle volontairement minimal :
 *   - rendre l'application installable (un handler `fetch` est requis) ;
 *   - offrir un écran hors-ligne au lieu du dinosaure du navigateur ;
 *   - accélérer les assets statiques immuables de Next (`/_next/static/…`).
 *
 * Ce qu'il ne fait PAS, par sécurité :
 *   - il ne met jamais en cache les réponses de l'API (`/api/…`) ni les
 *     navigations HTML : ce sont des données authentifiées, propres à un
 *     utilisateur et à un instant. Sur un appareil partagé, les servir depuis un
 *     cache serait une fuite.
 *   - il ne répond jamais à une requête non-GET.
 */

const CACHE_VERSION = "v1";
const PRECACHE = `horus-precache-${CACHE_VERSION}`;
const RUNTIME = `horus-runtime-${CACHE_VERSION}`;

// Coquille minimale mise en cache à l'installation.
const PRECACHE_URLS = [
  "/offline.html",
  "/icons/icon-192.png",
  "/icons/icon-512.png",
  "/manifest.webmanifest",
];

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches
      .open(PRECACHE)
      .then((cache) => cache.addAll(PRECACHE_URLS))
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
            .filter((key) => key !== PRECACHE && key !== RUNTIME)
            .map((key) => caches.delete(key)),
        ),
      )
      .then(() => self.clients.claim()),
  );
});

// Assets Next au hash stable : sûrs à servir depuis le cache en priorité.
function isImmutableAsset(url) {
  return (
    url.pathname.startsWith("/_next/static/") ||
    url.pathname.startsWith("/icons/") ||
    url.pathname.startsWith("/brand/") ||
    url.pathname === "/manifest.webmanifest"
  );
}

self.addEventListener("fetch", (event) => {
  const { request } = event;

  if (request.method !== "GET") return;

  const url = new URL(request.url);

  // Autre origine (Sentry, polices Google…) ou API : on ne s'en mêle pas.
  if (url.origin !== self.location.origin) return;
  if (url.pathname.startsWith("/api/")) return;

  // Navigations : réseau d'abord, écran hors-ligne en secours. Jamais de cache
  // de HTML authentifié.
  if (request.mode === "navigate") {
    event.respondWith(
      fetch(request).catch(() =>
        caches.match("/offline.html", { cacheName: PRECACHE }),
      ),
    );
    return;
  }

  // Assets immuables : cache d'abord, complété en tâche de fond.
  if (isImmutableAsset(url)) {
    event.respondWith(
      caches.open(RUNTIME).then(async (cache) => {
        const cached = await cache.match(request);
        const network = fetch(request)
          .then((response) => {
            if (response.ok) cache.put(request, response.clone());
            return response;
          })
          .catch(() => cached);
        return cached || network;
      }),
    );
  }
});
