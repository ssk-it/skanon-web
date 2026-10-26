import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import process from "node:process";
import { describe, expect, it } from "vitest";

/**
 * Les jetons de `src/styles.css`. Le CSS n'a pas le mixin dont SSK Canon se servait pour écrire une fois le thème sombre et l'appliquer à deux sélecteurs : le bloc y est écrit deux fois, et ce test tient les deux copies d'accord.
 */
const ROOT = join(process.cwd(), "src");
const STYLES = readFileSync(join(ROOT, "styles.css"), "utf8").replace(
  /\/\*[\s\S]*?\*\//g,
  "",
);

/** Les déclarations de variables d'un bloc, sans `color-scheme`. */
function variables(block: string): Map<string, string> {
  return new Map(
    [...block.matchAll(/(--[\w-]+)\s*:\s*([^;]+);/g)].map((m) => [
      m[1] ?? "",
      (m[2] ?? "").replace(/\s+/g, " ").trim(),
    ]),
  );
}

function block(pattern: RegExp): string {
  const m = pattern.exec(STYLES);
  if (!m) throw new Error(`Bloc introuvable : ${pattern}`);
  return m[1] ?? "";
}

const PLAIN = [...STYLES.matchAll(/(?:^|\n):root\s*\{([^}]*)\}/g)]
  .map((m) => m[1] ?? "")
  .join("\n");
const DARK_SYSTEM = block(
  /@media \(prefers-color-scheme: dark\)\s*\{\s*:root:not\(\[data-theme="clair"\]\)\s*\{([^}]*)\}/,
);
const DARK_CHOSEN = block(/:root\[data-theme="sombre"\]\s*\{([^}]*)\}/);

function listFiles(folder: string): string[] {
  return readdirSync(folder, { withFileTypes: true }).flatMap((entry) => {
    const path = join(folder, entry.name);
    return entry.isDirectory() ? listFiles(path) : [path];
  });
}

describe("jetons de style", () => {
  it("donne au thème sombre les mêmes valeurs, que le système le demande ou que l’utilisateur le choisisse", () => {
    const system = variables(DARK_SYSTEM);
    expect(system.size).toBeGreaterThan(20);
    expect(Object.fromEntries(variables(DARK_CHOSEN))).toEqual(
      Object.fromEntries(system),
    );
  });

  it("redéfinit en sombre chaque couleur du thème clair", () => {
    const clair = [...variables(PLAIN).keys()].filter(
      (v) =>
        (v.startsWith("--mat-sys-") && !v.startsWith("--mat-sys-level")) ||
        v.startsWith("--pc-statut") ||
        v.startsWith("--pc-op") ||
        v.startsWith("--pc-abroge") ||
        v.startsWith("--pc-domaine"),
    );
    const dark = variables(DARK_CHOSEN);
    expect(clair.filter((v) => !dark.has(v))).toEqual([]);
  });

  it("définit chaque variable `--mat-sys-*` que les sources emploient", () => {
    const defined = variables(PLAIN);
    const employees = new Set(
      listFiles(ROOT)
        .filter((f) => /\.(vue|css)$/.test(f))
        .flatMap((f) => [
          ...readFileSync(f, "utf8").matchAll(/var\((--mat-sys-[\w-]+)/g),
        ])
        .map((m) => m[1] ?? ""),
    );
    expect([...employees].filter((v) => !defined.has(v))).toEqual([]);
  });
});
