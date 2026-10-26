import { createHash } from "node:crypto";
import { readFileSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";
import type { Plugin, ResolvedConfig } from "vite";

/**
 * What makes the web version an installable application: the manifest, its icons, Skanon's service worker (`sw.js`) and the handover of SSK Canon's one (`ngsw-worker.js`). The plugin only applies to the build of the web version (`vite.config.ts`): the desktop application has no use for it.
 *
 * Written by hand rather than with `vite-plugin-pwa`: a list of files to precache and two tags to add are not worth a dependency with Workbox behind it.
 */
const ICI = import.meta.dirname;

/** The manifest stays at the address and under the `scope`, the `start_url` and the `protocol_handlers` of SSK Canon: this is what makes Chrome take the installed application for the same one, and update it instead of losing it. */
const MANIFESTE = "manifest.webmanifest";

const BALISES = [
  { tag: "link", attrs: { rel: "manifest", href: `/${MANIFESTE}` } },
  {
    tag: "link",
    attrs: { rel: "apple-touch-icon", href: "/icons/icon-192x192.png" },
  },
  { tag: "meta", attrs: { name: "theme-color", content: "#2f5cff" } },
] as const;

/** What the service worker does not precache: itself, and the handover. */
const HORS_PRECHARGEMENT = new Set(["sw.js", "ngsw-worker.js"]);

function listerFichiers(racine: string): string[] {
  // hidden files — `.DS_Store` — are not published
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
      // What this plugin emits does not appear in `bundle` during this same hook: it counts it itself.
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
        // Code-unit order, not `localeCompare`: the fingerprint below must not depend on the locale of the machine that builds.
        .sort((a, b) => (a < b ? -1 : a > b ? 1 : 0));

      // The version's fingerprint: script and stylesheet names carry their content's fingerprint; for the others — `index.html`, the manifest, the public files —, the content goes in here.
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
