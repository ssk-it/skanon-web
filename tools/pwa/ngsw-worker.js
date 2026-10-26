/**
 * The handover of SSK Canon's service worker, published as `/ngsw-worker.js` in the web version only.
 *
 * Browsers where the former application is installed keep a registration whose script is `/ngsw-worker.js`, and recheck it on every navigation. Finding this script instead of Angular's, they install it: it takes over without waiting, deletes Angular's caches (`ngsw:*`), and unregisters the registration. The next navigation therefore goes to the network, receives Skanon, which registers its own (`/sw.js`).
 *
 * It serves nothing, and reloads no tab: a tab of the former application left open keeps reading its files from the hosting, which keeps them alongside Skanon's, until the author reloads it (RG-nouvelle-version-proposee). This is the `safety-worker.js` Angular publishes for this purpose, rewritten here with nothing else.
 */
self.addEventListener("install", () => {
  void self.skipWaiting();
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    (async () => {
      const noms = await caches.keys();
      await Promise.all(
        noms.filter((n) => /^ngsw:/.test(n)).map((n) => caches.delete(n)),
      );
      await self.registration.unregister();
    })(),
  );
});
