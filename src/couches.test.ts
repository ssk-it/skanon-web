import { readdirSync, readFileSync } from "node:fs";
import { dirname, join, relative } from "node:path";
import process from "node:process";
import { describe, expect, it } from "vitest";

/**
 * Les couches de `docs/pratiques.md` : le cœur et les vues ne parlent au système que par les ports, et ne choisissent jamais un adaptateur. Le test lit les imports des sources, comme `gouttiere.test.ts` en lit les styles : une dépendance à rebours ne casse rien à l'exécution, et ne se voit qu'au jour où l'on sépare ce qu'elle relie.
 *
 * Les tests en sont exemptés : ils fournissent leurs doublures, et la plateforme du navigateur en est une.
 */

const RACINE = join(process.cwd(), "src");

/** Ce qu'importe une source, tel qu'écrit : statique, réexporté ou dynamique. */
export function listImports(source: string): string[] {
  const motifs = [
    /\b(?:import|export)\b[^;"'`]*?\bfrom\s*["']([^"']+)["']/g,
    /\bimport\s*["']([^"']+)["']/g,
    /\bimport\s*\(\s*["']([^"']+)["']\s*\)/g,
  ];
  return motifs.flatMap((motif) =>
    [...source.matchAll(motif)].map((m) => m[1] ?? ""),
  );
}

/** Le module visé, relatif à `src/` et sans extension ; un paquet garde son nom. */
export function resoudre(fichier: string, cible: string): string {
  if (!cible.startsWith(".")) return cible;
  return relative(RACINE, join(dirname(fichier), cible)).replace(
    /\.(ts|vue)$/,
    "",
  );
}

function lister(dossier: string, avecTests = false): string[] {
  return readdirSync(dossier, { withFileTypes: true }).flatMap((entree) => {
    const chemin = join(dossier, entree.name);
    if (entree.isDirectory()) return lister(chemin, avecTests);
    return /\.(ts|vue)$/.test(entree.name) &&
      (avecTests || !/\.test\.ts$/.test(entree.name))
      ? [chemin]
      : [];
  });
}

/** Ce que le cœur, les vues et le kit ne doivent pas importer : une racine de composition, le démarrage et les adaptateurs. */
const INTERDITS = [
  /^(main|demarrage|bureau\/main)$/,
  /^plateforme\/(web|bureau|authentificateur-testing)/,
  /^@tauri-apps\//,
];

function violations(
  fichiers: readonly string[],
  interdits: readonly RegExp[] = INTERDITS,
): string[] {
  return fichiers.flatMap((fichier) =>
    listImports(readFileSync(fichier, "utf8"))
      .map((cible) => resoudre(fichier, cible))
      .filter((module) => interdits.some((motif) => motif.test(module)))
      .map((module) => `${relative(process.cwd(), fichier)} → ${module}`),
  );
}

describe("les couches", () => {
  it("lit les imports statiques, réexportés et dynamiques", () => {
    const source = [
      'import { a } from "./a";',
      'import type {\n  B,\n} from "../b";',
      'export { c } from "./c";',
      'import "./d.css";',
      'const e = () => import("./e.vue");',
    ].join("\n");
    expect(listImports(source)).toEqual([
      "./a",
      "../b",
      "./c",
      "./d.css",
      "./e.vue",
    ]);
  });

  it("résout un import relatif depuis src/", () => {
    expect(resoudre(join(RACINE, "core/ui/x.ts"), "../../demarrage")).toBe(
      "demarrage",
    );
    expect(resoudre(join(RACINE, "features/a/B.vue"), "./C.vue")).toBe(
      "features/a/C",
    );
    expect(resoudre(join(RACINE, "x.ts"), "vue")).toBe("vue");
  });

  it("le cœur, les vues et le kit ne choisissent aucun adaptateur", () => {
    const fichiers = [
      ...lister(join(RACINE, "core")),
      ...lister(join(RACINE, "features")),
      ...lister(join(RACINE, "ui")),
      join(RACINE, "App.vue"),
    ];
    expect(violations(fichiers)).toEqual([]);
  });
});

/**
 * L'application de bureau et ce qui se vend vivent dans un dépôt privé, qui consomme ce paquet par son champ `exports` (ADR-extensions-commerciales). Ce dépôt n'en porte aucune logique, pas même le nom : rien n'y importe le cœur natif, et aucun fichier — tests compris, hors celui-ci, qui doit bien les écrire — ne nomme le service de mise à jour, la licence du bureau ou ses causes.
 */
describe("ce qui se vend", () => {
  const SOURCES = lister(RACINE, true).filter(
    (f) => relative(RACINE, f) !== "couches.test.ts",
  );

  it("n'est importé par aucun fichier", () => {
    expect(
      violations(SOURCES, [/^bureau\//, /^@tauri-apps\//, /^@wdio\//]),
    ).toEqual([]);
  });

  const NOMS_DU_BUREAU =
    /Skaron|tauri|LicenceService|CoffreDeLicence|COFFRE_DE_LICENCE|Licence et mises à jour|licence du poste|sans-licence|licence-(refusee|invalide)/i;

  it("n'est nommé par aucun fichier", () => {
    const nommant = SOURCES.filter((f) =>
      NOMS_DU_BUREAU.test(readFileSync(f, "utf8")),
    ).map((f) => relative(process.cwd(), f));
    expect(nommant).toEqual([]);
  });
});
