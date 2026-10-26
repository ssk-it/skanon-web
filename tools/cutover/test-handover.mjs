/**
 * Tests Skanon's handover from SSK Canon for whoever had installed it, in headless Chromium (no window opens).
 *
 * The browser sees what the deployment will show it: first the former application and its service worker; then, at the same origin and on the same port, `dist-web/` dropped over the former one, whose files are still served alongside, without `ngsw.json`. The test checks that Skanon ends up showing, that Angular's caches are gone, that Skanon's service worker controls the page, and that it is still served offline.
 *
 *   node tools/cutover/test-handover.mjs [--ancienne <folder>] [--sans-releve] [--garder-ngsw-json]
 *
 * `--ancienne`: the SSK Canon build (`dist/app/browser/` of ssk-canon-pwa); by default, the one of the neighbouring copy `../ssk-canon-pwa-mesures`. `--sans-releve` removes Skanon's `/ngsw-worker.js`, `--garder-ngsw-json` keeps the former one's served: both together make the test fail, and show that it sees the defect.
 *
 * `dist-web/` must be built beforehand: `pnpm build:web`.
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

/** Beyond this, the handover is deemed missed: an author does not reload ten times. */
const RECHARGEMENTS_MAX = 3;

for (const [nom, dossier] of [
  ["the former application", ANCIENNE],
  ["Skanon", SKANON],
]) {
  if (!existsSync(join(dossier, "index.html"))) {
    console.error(`Build of ${nom} not found: ${dossier}`);
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

/** What the hosting serves: the former one alone, then Skanon over it. */
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
  const chemin = decodeURIComponent(
    new URL(req.url, "http://localhost").pathname,
  );
  let fichier = trouver(chemin === "/" ? "/index.html" : chemin);
  // The hosting of a client-routed application serves `index.html` for an address that does not designate a file.
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
  console.log(`${vrai ? "ok  " : "FAIL"} ${message}`);
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
      // Angular's service worker only fills its caches on its first request: as long as `index.html` is not in them, it would fetch it from the hosting, and serve Skanon without having handed over anything.
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
  // 1. The former application, installed: its service worker controls the page and has filled its caches.
  await page.goto(`${ORIGINE}/`);
  // Angular registers its service worker once the application is stable, after 30 s at the latest.
  await attendre(
    (e) => e.inscriptions.some((s) => s?.endsWith("/ngsw-worker.js")),
    40_000,
    "the former one’s service worker did not register",
  );
  await page.reload();
  const avant = await attendre(
    (e) => e.controleur?.endsWith("/ngsw-worker.js") && e.ngswPret,
    20_000,
    "the former one’s service worker does not control the page",
  );
  constater(
    avant.titre.includes("SSK Canon"),
    `the former one shows first (“${avant.titre}”), under its service worker`,
  );

  // 2. The deployment: Skanon over the former one, without `ngsw.json`.
  servi = "skanon";
  let rechargements = 0;
  let apres = null;
  while (rechargements < RECHARGEMENTS_MAX) {
    await page.reload();
    rechargements++;
    // Give the browser time to recheck the registered script, and what results from it time to install.
    apres = await attendre(
      (e) =>
        e.titre.endsWith("— Skanon") ||
        !e.inscriptions.some((s) => s?.endsWith("/ngsw-worker.js")),
      10_000,
      "nothing changed",
    ).catch(() => null);
    if (apres?.titre.endsWith("— Skanon")) break;
  }
  apres = await etat();
  constater(
    apres.titre.endsWith("— Skanon"),
    `Skanon shows after ${rechargements} reload(s) (“${apres.titre}”)`,
  );

  // 3. Skanon has taken over: its service worker, its caches, nothing left of Angular.
  const installe = await attendre(
    (e) => e.controleur?.endsWith("/sw.js"),
    20_000,
    "Skanon’s service worker does not control the page",
  ).catch(() => etat());
  constater(
    installe.controleur?.endsWith("/sw.js"),
    `Skanon’s service worker controls the page (${installe.controleur})`,
  );
  constater(
    installe.inscriptions.length === 1,
    `a single registration remains (${installe.inscriptions.join(", ")})`,
  );
  constater(
    !installe.caches.some((c) => c.startsWith("ngsw:")),
    `Angular’s caches are gone (${installe.caches.join(", ")})`,
  );
  constater(
    installe.caches.some((c) => c.startsWith("skanon:")),
    "Skanon has its cache",
  );

  // 4. Offline: the hosting no longer answers at all.
  serveur.closeAllConnections();
  await new Promise((ok) => serveur.close(ok));
  await page.reload();
  await page.waitForLoadState("load");
  const horsLigne = await etat();
  constater(
    horsLigne.titre.endsWith("— Skanon"),
    `offline, Skanon is still served (“${horsLigne.titre}”)`,
  );
  const barre = await page
    .locator(".barre")
    .textContent()
    .catch(() => null);
  constater(!!barre?.includes("Skanon"), "offline, the bar shows");
  // a lazily loaded view, never opened, also opens offline: its script comes from the cache
  const paresseuse = readdirSync(join(SKANON, "assets")).find((f) =>
    /^ScopingPage-.*\.js$/.test(f),
  );
  const servie = await page.evaluate(
    async (url) => (await fetch(url)).ok,
    `/assets/${paresseuse}`,
  );
  constater(servie, `offline, a never-opened view loads (${paresseuse})`);
} catch (e) {
  constater(false, e.message);
} finally {
  await navigateur.close();
  if (serveur.listening) serveur.close();
}

if (echecs.length) {
  console.log("\nRequests served:");
  for (const ligne of journal) console.log(`  ${ligne}`);
  console.log(`\n${echecs.length} failure(s).`);
  process.exit(1);
}
console.log("\nThe handover holds.");
