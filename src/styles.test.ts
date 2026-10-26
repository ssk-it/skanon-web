import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import process from "node:process";
import { describe, expect, it } from "vitest";

/**
 * The tokens of `src/styles.css`. CSS lacks the mixin SSK Canon used to write the dark theme once and apply it to two selectors: the block is written twice there, and this test keeps the two copies in agreement.
 */
const ROOT = join(process.cwd(), "src");
const STYLES = readFileSync(join(ROOT, "styles.css"), "utf8").replace(
  /\/\*[\s\S]*?\*\//g,
  "",
);

/** A block's variable declarations, without `color-scheme`. */
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

describe("style tokens", () => {
  it("gives the dark theme the same values, whether the system asks for it or the user chooses it", () => {
    const system = variables(DARK_SYSTEM);
    expect(system.size).toBeGreaterThan(20);
    expect(Object.fromEntries(variables(DARK_CHOSEN))).toEqual(
      Object.fromEntries(system),
    );
  });

  it("redefines in dark each colour of the light theme", () => {
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

  it("defines every `--mat-sys-*` variable the sources use", () => {
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
