/**
 * Éprouve la relève de SSK Canon par Skanon chez qui l'avait installée, dans Chromium sans tête (aucune fenêtre ne s'ouvre).
 *
 * Le navigateur voit ce que le déploiement lui montrera : d'abord l'ancienne application et son service worker ; puis, à la même origine et au même port, `dist-web/` déposé par-dessus l'ancienne, dont les fichiers restent servis à côté, sans `ngsw.json`. L'épreuve vérifie que Skanon finit par s'afficher, que les caches d'Angular ont disparu, que le service worker de Skanon contrôle la page, et qu'elle reste servie hors ligne.
 *
 *   node outils/bascule/eprouver-releve.mjs [--ancienne <dossier>] [--sans-releve] [--garder-ngsw-json]
 *
 * `--ancienne` : le build de SSK Canon (`dist/app/browser/` de ssk-canon-pwa) ; par défaut, celui de la copie voisine `../ssk-canon-pwa-mesures`. `--sans-releve` retire le `/ngsw-worker.js` de Skanon, `--garder-ngsw-json` laisse servir celui de l'ancienne : les deux ensemble font échouer l'épreuve, et montrent qu'elle voit le défaut.
 *
 * `dist-web/` doit être construit avant : `pnpm build:web`.
 */
import { existsSync, readFileSync, readdirSync, statSync } from "node:fs";
import { createServer } from "node:http";
import { extname, join, resolve } from "node:path";
import process from "node:process";
import { chromium } from "playwright";

const RACINE = resolve(import.meta.dirname, "../..");
const args = process.argv.slice(2);
const option = (nom) => {
  const i = args.indexOf(nom);
  return i >= 0 ? args[i + 1] : undefined;
};
const ANCIENNE = resolve(
  option("--ancienne") ??
    join(RACINE, "../ssk-canon-pwa-mesures/app/dist/app/browser"),
);
const SKANON = join(RACINE, "dist-web");
const SANS_RELEVE = args.includes("--sans-releve");
const GARDER_NGSW_JSON = args.includes("--garder-ngsw-json");

/** Au-delà, la relève est tenue pour manquée : un rédacteur ne recharge pas dix fois. */
const RECHARGEMENTS_MAX = 3;

for (const [nom, dossier] of [
  ["l’ancienne application", ANCIENNE],
  ["Skanon", SKANON],
]) {
  if (!existsSync(join(dossier, "index.html"))) {
    console.error(`Build de ${nom} introuvable : ${dossier}`);
    process.exit(2);
  }
}

const TYPES = {
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".mjs": "text/javascript; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".json": "application/json",
  ".webmanifest": "application/manifest+json",
  ".svg": "image/svg+xml",
  ".png": "image/png",
  ".ico": "image/x-icon",
  ".woff": "font/woff",
  ".woff2": "font/woff2",
  ".ttf": "font/ttf",
};

/** Ce que l'hébergement sert : l'ancienne seule, puis Skanon par-dessus. */
let servi = "ancienne";
const journal = [];

function trouver(chemin) {
  const couches = servi === "ancienne" ? [ANCIENNE] : [SKANON, ANCIENNE];
  for (const couche of couches) {
    if (servi === "skanon") {
      if (chemin === "/ngsw.json" && !GARDER_NGSW_JSON) return null;
      if (couche === SKANON && chemin === "/ngsw-worker.js" && SANS_RELEVE)
        continue;
    }
    const fichier = join(couche, chemin);
    if (!fichier.startsWith(couche)) return null;
    if (existsSync(fichier) && statSync(fichier).isFile()) return fichier;
  }
  return null;
}

const serveur = createServer((req, res) => {
  const chemin = decodeURIComponent(new URL(req.url, "http://x").pathname);
  let fichier = trouver(chemin === "/" ? "/index.html" : chemin);
  // L'hébergement d'une application à routage client sert `index.html` pour une adresse qui ne désigne pas un fichier.
  if (!fichier && !extname(chemin)) fichier = trouver("/index.html");
  journal.push(`${servi} ${req.method} ${chemin} ${fichier ? 200 : 404}`);
  if (!fichier) {
    res.writeHead(404).end();
    return;
  }
  res.writeHead(200, {
    "content-type": TYPES[extname(fichier)] ?? "application/octet-stream",
    "cache-control": "no-cache",
  });
  res.end(readFileSync(fichier));
});
await new Promise((ok) => serveur.listen(0, "127.0.0.1", ok));
const ORIGINE = `http://127.0.0.1:${serveur.address().port}`;

const echecs = [];
function constater(vrai, message) {
  console.log(`${vrai ? "ok  " : "ÉCHEC"} ${message}`);
  if (!vrai) echecs.push(message);
}

const navigateur = await chromium.launch({ headless: true });
const contexte = await navigateur.newContext();
const page = await contexte.newPage();

const etat = () =>
  page.evaluate(async () => {
    const inscriptions = await navigator.serviceWorker.getRegistrations();
    return {
      titre: document.title,
      controleur: navigator.serviceWorker.controller?.scriptURL ?? null,
      inscriptions: inscriptions.map(
        (r) => (r.active ?? r.waiting ?? r.installing)?.scriptURL ?? null,
      ),
      caches: await caches.keys(),
      // Le service worker d'Angular ne remplit ses caches qu'à sa première requête : tant que `index.html` n'y est pas, il irait le chercher sur l'hébergement, et servirait Skanon sans rien avoir relevé.
      ngswPret: await (async () => {
        const nom = (await caches.keys()).find((c) =>
          /^ngsw:.*:assets:app:cache$/.test(c),
        );
        return !!nom && !!(await (await caches.open(nom)).match("/index.html"));
      })(),
    };
  });

async function attendre(condition, delai, message) {
  const fin = Date.now() + delai;
  for (;;) {
    const e = await etat().catch(() => null);
    if (e && condition(e)) return e;
    if (Date.now() > fin) throw new Error(`${message} : ${JSON.stringify(e)}`);
    await page.waitForTimeout(250);
  }
}

try {
  // 1. L'ancienne application, installée : son service worker contrôle la page et a rempli ses caches.
  await page.goto(`${ORIGINE}/`);
  // Angular inscrit son service worker une fois l'application stable, au plus tard après 30 s.
  await attendre(
    (e) => e.inscriptions.some((s) => s?.endsWith("/ngsw-worker.js")),
    40_000,
    "le service worker de l’ancienne ne s’est pas inscrit",
  );
  await page.reload();
  const avant = await attendre(
    (e) => e.controleur?.endsWith("/ngsw-worker.js") && e.ngswPret,
    20_000,
    "le service worker de l’ancienne ne contrôle pas la page",
  );
  constater(
    avant.titre.includes("SSK Canon"),
    `l’ancienne s’affiche d’abord (« ${avant.titre} »), sous son service worker`,
  );

  // 2. Le déploiement : Skanon par-dessus l'ancienne, sans `ngsw.json`.
  servi = "skanon";
  let rechargements = 0;
  let apres = null;
  while (rechargements < RECHARGEMENTS_MAX) {
    await page.reload();
    rechargements++;
    // Laisser au navigateur le temps de revérifier le script inscrit, et à ce qui en résulte de s'installer.
    apres = await attendre(
      (e) =>
        e.titre.endsWith("— Skanon") ||
        !e.inscriptions.some((s) => s?.endsWith("/ngsw-worker.js")),
      10_000,
      "rien n’a changé",
    ).catch(() => null);
    if (apres?.titre.endsWith("— Skanon")) break;
  }
  apres = await etat();
  constater(
    apres.titre.endsWith("— Skanon"),
    `Skanon s’affiche après ${rechargements} rechargement(s) (« ${apres.titre} »)`,
  );

  // 3. Skanon a pris la place : son service worker, ses caches, plus rien d'Angular.
  const installe = await attendre(
    (e) => e.controleur?.endsWith("/sw.js"),
    20_000,
    "le service worker de Skanon ne contrôle pas la page",
  ).catch(() => etat());
  constater(
    installe.controleur?.endsWith("/sw.js"),
    `le service worker de Skanon contrôle la page (${installe.controleur})`,
  );
  constater(
    installe.inscriptions.length === 1,
    `une seule inscription reste (${installe.inscriptions.join(", ")})`,
  );
  constater(
    !installe.caches.some((c) => c.startsWith("ngsw:")),
    `les caches d’Angular ont disparu (${installe.caches.join(", ")})`,
  );
  constater(
    installe.caches.some((c) => c.startsWith("skanon:")),
    "Skanon a son cache",
  );

  // 4. Hors ligne : l'hébergement ne répond plus du tout.
  serveur.closeAllConnections();
  await new Promise((ok) => serveur.close(ok));
  await page.reload();
  await page.waitForLoadState("load");
  const horsLigne = await etat();
  constater(
    horsLigne.titre.endsWith("— Skanon"),
    `hors ligne, Skanon reste servi (« ${horsLigne.titre} »)`,
  );
  const barre = await page
    .locator(".barre")
    .textContent()
    .catch(() => null);
  constater(!!barre?.includes("Skanon"), "hors ligne, la barre s’affiche");
  // une vue chargée à la demande, jamais ouverte, s'ouvre aussi hors ligne : son script vient du cache
  const paresseuse = readdirSync(join(SKANON, "assets")).find((f) =>
    /^CadragePage-.*\.js$/.test(f),
  );
  const servie = await page.evaluate(
    async (url) => (await fetch(url)).ok,
    `/assets/${paresseuse}`,
  );
  constater(
    servie,
    `hors ligne, une vue jamais ouverte se charge (${paresseuse})`,
  );
} catch (e) {
  constater(false, e.message);
} finally {
  await navigateur.close();
  if (serveur.listening) serveur.close();
}

if (echecs.length) {
  console.log("\nRequêtes servies :");
  for (const ligne of journal) console.log(`  ${ligne}`);
  console.log(`\n${echecs.length} échec(s).`);
  process.exit(1);
}
console.log("\nLa relève tient.");
