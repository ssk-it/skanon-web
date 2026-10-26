/**
 * Le service worker de Skanon, publié en `/sw.js` dans la seule version web.
 *
 * `outils/pwa/pwa.ts` remplace au build `__VERSION__` et `__FICHIERS__` par l'empreinte de la version et la liste de ce qu'elle publie : une nouvelle version change donc ce script, et c'est à ce changement que le navigateur la reconnaît.
 *
 * Il précharge à l'installation tout ce que la consultation hors ligne demande, et sert ensuite chaque fichier de son cache, `index.html` pour toute navigation : la page et ses scripts viennent ainsi toujours d'une même version, jamais d'un mélange. Une nouvelle version s'installe à côté et attend que la page la demande (RG-nouvelle-version-proposee) — sauf quand elle remplace le service worker de l'ancienne application, qui n'a rien à proposer.
 */
/* global __FICHIERS__ -- remplacé au build */
const VERSION = "__VERSION__";
const FICHIERS = __FICHIERS__;

const CACHE = `skanon:${VERSION}`;
const INDEX = "/index.html";

/** Les caches de Skanon et ceux du service worker d'Angular, que l'ancienne application laissait. */
const NOTRE_CACHE = /^skanon:/;
const CACHE_ANGULAR = /^ngsw:/;

self.addEventListener("install", (event) => {
  event.waitUntil(
    (async () => {
      const cache = await caches.open(CACHE);
      // `reload` : le préchargement ne doit pas reprendre une copie que le cache HTTP garderait d'une version précédente.
      await cache.addAll(
        FICHIERS.map((f) => new Request(f, { cache: "reload" })),
      );
      // La relève : sous l'ancienne application, il n'y a pas de version de Skanon à laisser finir.
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
  if (event.data?.type === "SKIP_WAITING") void self.skipWaiting();
});

/**
 * Les navigations que sert `index.html` : celles de l'application, non celles d'un fichier. Les mêmes que le service worker d'Angular (`navigationUrls` par défaut) — une adresse dont le dernier segment porte un point, ou qui contient `__`, va au réseau.
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
 * Un fichier de la version : du cache, sinon du réseau. Un script ou une feuille de `/assets/` que ni l'un ni l'autre ne sert — l'hébergement ne l'a plus, et le cache de cette version a été remplacé — signale à la page que sa version est perdue (RG-version-perdue-signalee). L'absence de réseau ne le signale pas : c'est une autre cause.
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
