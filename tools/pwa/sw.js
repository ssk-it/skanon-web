/**
 * Skanon's service worker, published as `/sw.js` in the web version only.
 *
 * `tools/pwa/pwa.ts` replaces `__VERSION__` and `__FICHIERS__` at build time with the version's fingerprint and the list of what it publishes: a new version therefore changes this script, and it is by this change that the browser recognises it.
 *
 * On install it precaches everything offline reading needs, and then serves each file from its cache, `index.html` for any navigation: the page and its scripts thus always come from one and the same version, never from a mix. A new version installs alongside and waits for the page to ask for it (RG-nouvelle-version-proposee) — except when it replaces the former application's service worker, which has nothing to offer.
 */
/* global __FICHIERS__ -- replaced at build time */
const VERSION = "__VERSION__";
const FICHIERS = __FICHIERS__;

const CACHE = `skanon:${VERSION}`;
const INDEX = "/index.html";

/** Skanon's caches and those of Angular's service worker, which the former application left behind. */
const NOTRE_CACHE = /^skanon:/;
const CACHE_ANGULAR = /^ngsw:/;

self.addEventListener("install", (event) => {
  event.waitUntil(
    (async () => {
      const cache = await caches.open(CACHE);
      // `reload`: precaching must not pick up a copy the HTTP cache would keep from a previous version.
      await cache.addAll(
        FICHIERS.map((f) => new Request(f, { cache: "reload" })),
      );
      // The handover: under the former application, there is no Skanon version to let finish.
      const noms = await caches.keys();
      if (noms.some((n) => CACHE_ANGULAR.test(n))) await self.skipWaiting();
    })(),
  );
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    (async () => {
      const noms = await caches.keys();
      await Promise.all(
        noms
          .filter(
            (n) =>
              n !== CACHE && (NOTRE_CACHE.test(n) || CACHE_ANGULAR.test(n)),
          )
          .map((n) => caches.delete(n)),
      );
      await self.clients.claim();
    })(),
  );
});

self.addEventListener("message", (event) => {
  // Only a page of this site may make the waiting version serve.
  if (event.origin !== self.location.origin) return;
  if (event.data?.type === "SKIP_WAITING") void self.skipWaiting();
});

/**
 * The navigations `index.html` serves: the application's, not a file's. The same as Angular's service worker (default `navigationUrls`) — an address whose last segment contains a dot, or which contains `__`, goes to the network.
 */
function estNavigationApplication(url) {
  const dernier = url.pathname.split("/").pop() ?? "";
  return !dernier.includes(".") && !url.pathname.includes("__");
}

self.addEventListener("fetch", (event) => {
  const requete = event.request;
  if (requete.method !== "GET") return;
  const url = new URL(requete.url);
  if (url.origin !== self.location.origin) return;

  if (requete.mode === "navigate") {
    if (!estNavigationApplication(url)) return;
    event.respondWith(servirIndex(requete));
    return;
  }
  event.respondWith(servir(requete, event.clientId));
});

async function servirIndex(requete) {
  const cache = await caches.open(CACHE);
  return (await cache.match(INDEX)) ?? fetch(requete);
}

/**
 * A file of the version: from the cache, otherwise from the network. A script or stylesheet under `/assets/` that neither serves — the hosting no longer has it, and this version's cache has been replaced — tells the page its version is lost (RG-version-perdue-signalee). No network does not signal it: that is another cause.
 */
async function servir(requete, clientId) {
  const cache = await caches.open(CACHE);
  const enCache = await cache.match(requete);
  if (enCache) return enCache;
  const reponse = await fetch(requete);
  if (
    reponse.status === 404 &&
    new URL(requete.url).pathname.startsWith("/assets/")
  ) {
    const client = clientId ? await self.clients.get(clientId) : null;
    client?.postMessage({ type: "VERSION_PERDUE" });
  }
  return reponse;
}
