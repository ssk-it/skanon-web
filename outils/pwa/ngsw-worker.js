/**
 * La relève du service worker de SSK Canon, publiée en `/ngsw-worker.js` dans la seule version web.
 *
 * Les navigateurs où l'ancienne application est installée gardent une inscription dont le script est `/ngsw-worker.js`, et le revérifient à chaque navigation. Trouvant ce script-ci à la place de celui d'Angular, ils l'installent : il prend la place sans attendre, efface les caches d'Angular (`ngsw:*`), et désinscrit l'inscription. La navigation suivante va donc au réseau, reçoit Skanon, qui inscrit le sien (`/sw.js`).
 *
 * Il ne sert rien, et ne recharge aucun onglet : un onglet de l'ancienne application resté ouvert continue de lire ses fichiers sur l'hébergement, qui les garde à côté de ceux de Skanon, jusqu'à ce que le rédacteur le recharge (RG-nouvelle-version-proposee). C'est le `safety-worker.js` qu'Angular publie pour cet usage, réécrit ici sans rien d'autre.
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
