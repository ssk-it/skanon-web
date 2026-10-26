import { readdirSync, readFileSync } from "node:fs";
import { dirname, join, relative } from "node:path";
import process from "node:process";
import { describe, expect, it } from "vitest";

/**
 * Les couches de `docs/pratiques.md` : le cœur et les vues ne parlent au système que par les ports, et ne choisissent jamais un adaptateur. Le test lit les imports des sources, comme `gouttiere.test.ts` en lit les styles : une dépendance à rebours ne casse rien à l'exécution, et ne se voit qu'au jour où l'on sépare ce qu'elle relie.
 *
 * Les tests en sont exemptés : ils fournissent leurs doublures, et la plateforme du navigateur en est une.
 */

const ROOT = join(process.cwd(), "src");

/** Ce qu'importe une source, tel qu'écrit : statique, réexporté ou dynamique. */
export function listImports(source: string): string[] {
  const patterns = [
    /\b(?:import|export)\b[^;"'`]*?\bfrom\s*["']([^"']+)["']/g,
    /\bimport\s*["']([^"']+)["']/g,
    /\bimport\s*\(\s*["']([^"']+)["']\s*\)/g,
  ];
  return patterns.flatMap((pattern) =>
    [...source.matchAll(pattern)].map((m) => m[1] ?? ""),
  );
}

/** Le module visé, relatif à `src/` et sans extension ; un paquet garde son nom. */
export function resolve(file: string, target: string): string {
  if (!target.startsWith(".")) return target;
  return relative(ROOT, join(dirname(file), target)).replace(/\.(ts|vue)$/, "");
}

function listFiles(folder: string, withTests = false): string[] {
  return readdirSync(folder, { withFileTypes: true }).flatMap((entry) => {
    const path = join(folder, entry.name);
    if (entry.isDirectory()) return listFiles(path, withTests);
    return /\.(ts|vue)$/.test(entry.name) &&
      (withTests || !/\.test\.ts$/.test(entry.name))
      ? [path]
      : [];
  });
}

/** Ce que le cœur, les vues et le kit ne doivent pas importer : une racine de composition, le démarrage et les adaptateurs. */
const FORBIDDEN = [
  /^(main|startup|bureau\/main)$/,
  /^platform\/(web|bureau|authenticator-testing)/,
  /^@tauri-apps\//,
];

function violations(
  files: readonly string[],
  forbidden: readonly RegExp[] = FORBIDDEN,
): string[] {
  return files.flatMap((file) =>
    listImports(readFileSync(file, "utf8"))
      .map((target) => resolve(file, target))
      .filter((module) => forbidden.some((pattern) => pattern.test(module)))
      .map((module) => `${relative(process.cwd(), file)} → ${module}`),
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
    expect(resolve(join(ROOT, "core/ui/x.ts"), "../../startup")).toBe(
      "startup",
    );
    expect(resolve(join(ROOT, "features/a/B.vue"), "./C.vue")).toBe(
      "features/a/C",
    );
    expect(resolve(join(ROOT, "x.ts"), "vue")).toBe("vue");
  });

  it("le cœur, les vues et le kit ne choisissent aucun adaptateur", () => {
    const files = [
      ...listFiles(join(ROOT, "core")),
      ...listFiles(join(ROOT, "features")),
      ...listFiles(join(ROOT, "ui")),
      join(ROOT, "App.vue"),
    ];
    expect(violations(files)).toEqual([]);
  });
});

/**
 * L'application de bureau et ce qui se vend vivent dans un dépôt privé, qui consomme ce paquet par son champ `exports` (ADR-extensions-commerciales). Ce dépôt n'en porte aucune logique, pas même le nom : rien n'y importe le cœur natif, et aucun fichier — tests compris, hors celui-ci, qui doit bien les écrire — ne nomme le service de mise à jour, la licence du bureau ou ses causes.
 */
describe("ce qui se vend", () => {
  const SOURCES = listFiles(ROOT, true).filter(
    (f) => relative(ROOT, f) !== "layers.test.ts",
  );

  it("n'est importé par aucun fichier", () => {
    expect(
      violations(SOURCES, [/^bureau\//, /^@tauri-apps\//, /^@wdio\//]),
    ).toEqual([]);
  });

  const DESKTOP_NAMES =
    /Skaron|tauri|LicenceService|CoffreDeLicence|COFFRE_DE_LICENCE|Licence et mises à jour|licence du poste|sans-licence|licence-(refusee|invalide)/i;

  it("n'est nommé par aucun fichier", () => {
    const naming = SOURCES.filter((f) =>
      DESKTOP_NAMES.test(readFileSync(f, "utf8")),
    ).map((f) => relative(process.cwd(), f));
    expect(naming).toEqual([]);
  });
});
