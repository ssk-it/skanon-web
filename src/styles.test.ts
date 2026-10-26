import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import process from "node:process";
import { describe, expect, it } from "vitest";

/**
 * Les jetons de `src/styles.css`. Le CSS n'a pas le mixin dont SSK Canon se servait pour écrire une fois le thème sombre et l'appliquer à deux sélecteurs : le bloc y est écrit deux fois, et ce test tient les deux copies d'accord.
 */
const RACINE = join(process.cwd(), "src");
const STYLES = readFileSync(join(RACINE, "styles.css"), "utf8").replace(
  /\/\*[\s\S]*?\*\//g,
  "",
);

/** Les déclarations de variables d'un bloc, sans `color-scheme`. */
function variables(bloc: string): Map<string, string> {
  return new Map(
    [...bloc.matchAll(/(--[\w-]+)\s*:\s*([^;]+);/g)].map((m) => [
      m[1] ?? "",
      (m[2] ?? "").replace(/\s+/g, " ").trim(),
    ]),
  );
}

function bloc(motif: RegExp): string {
  const m = motif.exec(STYLES);
  if (!m) throw new Error(`Bloc introuvable : ${motif}`);
  return m[1] ?? "";
}

const CLAIR = [...STYLES.matchAll(/(?:^|\n):root\s*\{([^}]*)\}/g)]
  .map((m) => m[1] ?? "")
  .join("\n");
const SOMBRE_SYSTEME = bloc(
  /@media \(prefers-color-scheme: dark\)\s*\{\s*:root:not\(\[data-theme="clair"\]\)\s*\{([^}]*)\}/,
);
const SOMBRE_CHOISI = bloc(/:root\[data-theme="sombre"\]\s*\{([^}]*)\}/);

function listFichiers(dossier: string): string[] {
  return readdirSync(dossier, { withFileTypes: true }).flatMap((entree) => {
    const chemin = join(dossier, entree.name);
    return entree.isDirectory() ? listFichiers(chemin) : [chemin];
  });
}

describe("jetons de style", () => {
  it("donne au thème sombre les mêmes valeurs, que le système le demande ou que l’utilisateur le choisisse", () => {
    const systeme = variables(SOMBRE_SYSTEME);
    expect(systeme.size).toBeGreaterThan(20);
    expect(Object.fromEntries(variables(SOMBRE_CHOISI))).toEqual(
      Object.fromEntries(systeme),
    );
  });

  it("redéfinit en sombre chaque couleur du thème clair", () => {
    const clair = [...variables(CLAIR).keys()].filter(
      (v) =>
        (v.startsWith("--mat-sys-") && !v.startsWith("--mat-sys-level")) ||
        v.startsWith("--pc-statut") ||
        v.startsWith("--pc-op") ||
        v.startsWith("--pc-abroge") ||
        v.startsWith("--pc-domaine"),
    );
    const sombre = variables(SOMBRE_CHOISI);
    expect(clair.filter((v) => !sombre.has(v))).toEqual([]);
  });

  it("définit chaque variable `--mat-sys-*` que les sources emploient", () => {
    const definies = variables(CLAIR);
    const employees = new Set(
      listFichiers(RACINE)
        .filter((f) => /\.(vue|css)$/.test(f))
        .flatMap((f) => [
          ...readFileSync(f, "utf8").matchAll(/var\((--mat-sys-[\w-]+)/g),
        ])
        .map((m) => m[1] ?? ""),
    );
    expect([...employees].filter((v) => !definies.has(v))).toEqual([]);
  });
});
