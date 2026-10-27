import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import process from "node:process";
import { describe, expect, it } from "vitest";
import { hueAtRank } from "./core/ui/domain-color";

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

/**
 * The contrasts of WCAG 2.2 level AA — RG-accessibilite-aa —, in each of the two themes: 4.5:1 for text (1.4.3), 3:1 for what delimits a control (1.4.11). Computed on the tokens; the rendered page remains to be looked at (2026-028, decision 02).
 */
const SURFACES = [
  "--mat-sys-surface",
  "--mat-sys-surface-container-low",
  "--mat-sys-surface-container",
  "--mat-sys-surface-container-high",
  "--mat-sys-surface-container-highest",
];

/** Each text colour, and the backgrounds it is written on. */
const TEXTS: Record<string, readonly string[]> = {
  "--mat-sys-on-surface": SURFACES,
  "--mat-sys-on-surface-variant": SURFACES,
  "--mat-sys-primary": SURFACES,
  "--mat-sys-tertiary": SURFACES,
  "--mat-sys-error": SURFACES,
  "--mat-sys-on-error-container": SURFACES,
  "--mat-sys-on-primary": ["--mat-sys-primary"],
  "--mat-sys-on-primary-container": ["--mat-sys-primary-container"],
  "--mat-sys-on-secondary-container": ["--mat-sys-secondary-container"],
  "--pc-abroge-texte": SURFACES,
  ...Object.fromEntries(
    ["brouillon", "relecture", "validee", "livree"].map((s) => [
      `--pc-statut-${s}`,
      [...SURFACES, `--pc-statut-${s}-bg`],
    ]),
  ),
  ...Object.fromEntries(
    ["cree", "modifie", "abroge", "touche"].map((o) => [
      `--pc-op-${o}`,
      [...SURFACES, ...(o === "touche" ? [] : [`--pc-op-${o}-bg`])],
    ]),
  ),
};

/** What delimits a field or a control against its background. */
const DELIMITERS = ["--mat-sys-outline"];

const THEMES: Record<string, Map<string, string>> = {
  light: variables(PLAIN),
  dark: new Map([...variables(PLAIN), ...variables(DARK_CHOSEN)]),
};

/** The relative luminance of a linear sRGB colour. */
function linearLuminance([r, g, b]: readonly number[]): number {
  return 0.2126 * (r ?? 0) + 0.7152 * (g ?? 0) + 0.0722 * (b ?? 0);
}

function toLinear(hex: string): number[] {
  const m = /^#([0-9a-f]{2})([0-9a-f]{2})([0-9a-f]{2})$/i.exec(hex);
  if (!m) throw new Error(`Not a hexadecimal colour: ${hex}`);
  return m.slice(1).map((c) => {
    const v = parseInt(c, 16) / 255;
    return v <= 0.04045 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4;
  });
}

/** OKLCH to linear sRGB, brought back into gamut as a clipping browser does. */
function oklch(l: number, c: number, h: number): number[] {
  const a = c * Math.cos((h * Math.PI) / 180);
  const b = c * Math.sin((h * Math.PI) / 180);
  const l3 = (l + 0.3963377774 * a + 0.2158037573 * b) ** 3;
  const m3 = (l - 0.1055613458 * a - 0.0638541728 * b) ** 3;
  const s3 = (l - 0.0894841775 * a - 1.291485548 * b) ** 3;
  return [
    4.0767416621 * l3 - 3.3077115913 * m3 + 0.2309699292 * s3,
    -1.2684380046 * l3 + 2.6097574011 * m3 - 0.3413193965 * s3,
    -0.0041960863 * l3 - 0.7034186147 * m3 + 1.707614701 * s3,
  ].map((v) => Math.min(1, Math.max(0, v)));
}

function contrast(a: readonly number[], b: readonly number[]): number {
  const [lighter, darker] = [linearLuminance(a), linearLuminance(b)].sort(
    (x, y) => y - x,
  );
  return ((lighter ?? 0) + 0.05) / ((darker ?? 0) + 0.05);
}

function tokenValue(theme: Map<string, string>, token: string): number[] {
  const v = theme.get(token);
  if (!v) throw new Error(`Missing token: ${token}`);
  return toLinear(v);
}

/** The pairs that miss their threshold, readable in the failure message. */
function belowThreshold(
  pairs: readonly [string, string][],
  threshold: number,
): string[] {
  return Object.entries(THEMES).flatMap(([name, theme]) =>
    pairs
      .map(([foreground, background]) => ({
        foreground,
        background,
        ratio: contrast(
          tokenValue(theme, foreground),
          tokenValue(theme, background),
        ),
      }))
      .filter((c) => c.ratio < threshold)
      .map(
        (c) =>
          `${name}: ${c.foreground} on ${c.background} — ${c.ratio.toFixed(2)}:1`,
      ),
  );
}

describe("contrasts — RG-accessibilite-aa", () => {
  it("computes contrast as WCAG does: 21:1 from black to white, 1:1 from a colour to itself", () => {
    expect(contrast(toLinear("#000000"), toLinear("#ffffff"))).toBeCloseTo(21);
    expect(contrast(toLinear("#74777f"), toLinear("#74777f"))).toBe(1);
    expect(contrast(toLinear("#767676"), toLinear("#ffffff"))).toBeCloseTo(
      4.54,
      2,
    );
  });

  it("holds 4.5:1 for each text colour on each of its backgrounds", () => {
    const pairs = Object.entries(TEXTS).flatMap(([text, backgrounds]) =>
      backgrounds.map((background): [string, string] => [text, background]),
    );
    expect(belowThreshold(pairs, 4.5)).toEqual([]);
  });

  it("holds 3:1 for what delimits a control", () => {
    const pairs = DELIMITERS.flatMap((d) =>
      SURFACES.map((background): [string, string] => [d, background]),
    );
    expect(belowThreshold(pairs, 3)).toEqual([]);
  });

  it("holds 4.5:1 for a domain's text, whatever its hue, on its background and on the surface", () => {
    const failures = Object.entries(THEMES).flatMap(([name, theme]) => {
      const n = (token: string) => Number(theme.get(token));
      const surface = tokenValue(theme, "--mat-sys-surface");
      return Array.from({ length: 16 }, (_, i) => i + 1)
        .flatMap((total) =>
          Array.from({ length: total }, (_, rank) => hueAtRank(rank, total)),
        )
        .flatMap((h) => {
          const text = oklch(n("--pc-domaine-l"), n("--pc-domaine-c"), h);
          const background = oklch(
            n("--pc-domaine-bg-l"),
            n("--pc-domaine-bg-c"),
            h,
          );
          return [contrast(text, background), contrast(text, surface)]
            .filter((r) => r < 4.5)
            .map((r) => `${name}: hue ${h.toFixed(0)} — ${r.toFixed(2)}:1`);
        });
    });
    expect([...new Set(failures)]).toEqual([]);
  });

  it("writes text only with a colour whose contrast is checked", () => {
    const checked = new Set([...Object.keys(TEXTS), "--pc-domaine"]);
    const gaps = listFiles(ROOT)
      .filter((f) => /\.(vue|css)$/.test(f))
      .flatMap((f) =>
        [
          ...readFileSync(f, "utf8").matchAll(
            /(?:^|[\s;{])color\s*:\s*var\((--[\w-]+)\)/g,
          ),
        ]
          .map((m) => m[1] ?? "")
          .filter((v) => !checked.has(v))
          .map((v) => `${f.slice(ROOT.length + 1)}: ${v}`),
      );
    expect(gaps).toEqual([]);
  });
});

/**
 * RG-accessibilite-aa: a person who asks the system to reduce motion sees animations suspended. A transition stops everywhere, through a shared rule; an animation that runs forever — a wait's — slows down in its component, which knows what it says.
 */
describe("reduced motion — RG-accessibilite-aa", () => {
  it("stops every transition and smooth scrolling when the system asks", () => {
    const reduced =
      /@media \(prefers-reduced-motion: reduce\)\s*\{([\s\S]*?)\n\}/.exec(
        STYLES,
      )?.[1];
    expect(reduced).toBeDefined();
    expect(reduced).toMatch(/transition-duration:\s*0s\s*!important/);
    expect(reduced).toMatch(/scroll-behavior:\s*auto\s*!important/);
  });

  it("slows down in its component every animation that runs forever", () => {
    const unreduced = listFiles(ROOT)
      .filter((f) => /\.(vue|css)$/.test(f))
      .filter((f) => {
        const source = readFileSync(f, "utf8");
        return (
          /animation:[^;]*infinite/.test(source) &&
          !source.includes("prefers-reduced-motion")
        );
      })
      .map((f) => f.slice(ROOT.length + 1));
    expect(unreduced).toEqual([]);
  });
});
