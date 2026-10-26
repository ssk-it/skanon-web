import { createHash } from "node:crypto";
import { readFileSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";
import type { Plugin, ResolvedConfig } from "vite";

/**
 * Ce qui fait de la version web une application installable : le manifeste, ses icônes, le service worker de Skanon (`sw.js`) et la relève de celui de SSK Canon (`ngsw-worker.js`). Le greffon ne s'applique qu'au build de la version web (`vite.config.ts`) : l'application de bureau n'en a pas l'usage.
 *
 * Écrit à la main plutôt que par `vite-plugin-pwa` : une liste de fichiers à précharger et deux balises à poser ne valent pas une dépendance et Workbox derrière elle.
 */
const ICI = import.meta.dirname;

/** Le manifeste reste à l'adresse et sous le `scope`, le `start_url` et le `protocol_handlers` de SSK Canon : c'est ce qui fait que Chrome tient l'application installée pour la même, et la met à jour au lieu de la perdre. */
const MANIFESTE = "manifest.webmanifest";

const BALISES = [
  { tag: "link", attrs: { rel: "manifest", href: `/${MANIFESTE}` } },
  {
    tag: "link",
    attrs: { rel: "apple-touch-icon", href: "/icons/icon-192x192.png" },
  },
  { tag: "meta", attrs: { name: "theme-color", content: "#2f5cff" } },
] as const;

/** Ce que le service worker ne précharge pas : lui-même, et la relève. */
const HORS_PRECHARGEMENT = new Set(["sw.js", "ngsw-worker.js"]);

function listerFichiers(racine: string): string[] {
  // les fichiers cachés — `.DS_Store` — ne sont pas publiés
  return readdirSync(racine)
    .filter((nom) => !nom.startsWith("."))
    .flatMap((nom) => {
      const chemin = join(racine, nom);
      return statSync(chemin).isDirectory()
        ? listerFichiers(chemin).map((f) => `${nom}/${f}`)
        : [nom];
    });
}

export function pwa(): Plugin {
  let config: ResolvedConfig;
  return {
    name: "skanon-pwa",
    apply: "build",
    enforce: "post",
    configResolved(c) {
      config = c;
    },
    transformIndexHtml() {
      return BALISES.map((b) => ({ ...b, injectTo: "head" as const }));
    },
    generateBundle(_options, bundle) {
      // Ce que ce greffon émet n'apparaît pas dans `bundle` pendant ce même crochet : il le compte lui-même.
      const emis = new Map<string, Uint8Array>();
      const emettre = (fileName: string, source: Uint8Array | string) => {
        const contenu =
          typeof source === "string"
            ? new TextEncoder().encode(source)
            : source;
        emis.set(fileName, contenu);
        this.emitFile({ type: "asset", fileName, source: contenu });
      };

      emettre(MANIFESTE, readFileSync(join(ICI, MANIFESTE)));
      const icones = join(ICI, "icons");
      for (const f of listerFichiers(icones))
        emettre(`icons/${f}`, readFileSync(join(icones, f)));
      emettre("ngsw-worker.js", readFileSync(join(ICI, "ngsw-worker.js")));

      const publics = config.publicDir ? listerFichiers(config.publicDir) : [];
      const fichiers = [...Object.keys(bundle), ...emis.keys(), ...publics]
        .filter((f) => !HORS_PRECHARGEMENT.has(f))
        .sort();

      // L'empreinte de la version : les noms des scripts et des feuilles portent celle de leur contenu ; pour les autres — `index.html`, le manifeste, les fichiers publics —, le contenu entre ici.
      const empreinte = createHash("sha256");
      for (const f of fichiers) {
        empreinte.update(f);
        const sortie = bundle[f];
        const emi = emis.get(f);
        if (sortie?.type === "asset") empreinte.update(sortie.source);
        else if (emi) empreinte.update(emi);
        else if (!sortie)
          empreinte.update(readFileSync(join(config.publicDir, f)));
      }
      const version = empreinte.digest("hex").slice(0, 16);

      const gabarit = readFileSync(join(ICI, "sw.js"), "utf8");
      emettre(
        "sw.js",
        gabarit
          .replace(
            'const VERSION = "__VERSION__";',
            `const VERSION = ${JSON.stringify(version)};`,
          )
          .replace(
            "const FICHIERS = __FICHIERS__;",
            `const FICHIERS = ${JSON.stringify(fichiers.map((f) => `/${f}`))};`,
          ),
      );
    },
  };
}
