import { readdirSync, readFileSync } from "node:fs";
import { dirname, join, relative } from "node:path";
import process from "node:process";
import { describe, expect, it } from "vitest";

/**
 * The layers of `docs/practices.md`: the core and the views only talk to the system through the ports, and never choose an adapter. The test reads the sources' imports, as `gutter.test.ts` reads their styles: a backwards dependency breaks nothing at runtime, and only shows the day one separates what it connects.
 *
 * Tests are exempt: they provide their fakes, and the browser platform is one of them.
 */

const ROOT = join(process.cwd(), "src");

/** What a source imports, as written: static, re-exported or dynamic. */
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

/** The targeted module, relative to `src/` and without extension; a package keeps its name. */
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

/** What the core, the views and the kit must not import: a composition root, startup and the adapters. */
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

describe("the layers", () => {
  it("reads static, re-exported and dynamic imports", () => {
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

  it("resolves a relative import from src/", () => {
    expect(resolve(join(ROOT, "core/ui/x.ts"), "../../startup")).toBe(
      "startup",
    );
    expect(resolve(join(ROOT, "features/a/B.vue"), "./C.vue")).toBe(
      "features/a/C",
    );
    expect(resolve(join(ROOT, "x.ts"), "vue")).toBe("vue");
  });

  it("the core, the views and the kit choose no adapter", () => {
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
 * The desktop application and what is sold live in a private repo, which consumes this package through its `exports` field (ADR-extensions-commerciales). This repo carries none of its logic, not even its name: nothing here imports the native core, and no file — tests included, except this one, which has to write them — names the update service, the desktop licence or its causes.
 */
describe("what is sold", () => {
  const SOURCES = listFiles(ROOT, true).filter(
    (f) => relative(ROOT, f) !== "layers.test.ts",
  );

  it("is imported by no file", () => {
    expect(
      violations(SOURCES, [/^bureau\//, /^@tauri-apps\//, /^@wdio\//]),
    ).toEqual([]);
  });

  const DESKTOP_NAMES =
    /Skaron|tauri|LicenceService|CoffreDeLicence|COFFRE_DE_LICENCE|Licence et mises à jour|licence du poste|sans-licence|licence-(refusee|invalide)/i;

  it("is named by no file", () => {
    const naming = SOURCES.filter((f) =>
      DESKTOP_NAMES.test(readFileSync(f, "utf8")),
    ).map((f) => relative(process.cwd(), f));
    expect(naming).toEqual([]);
  });
});
