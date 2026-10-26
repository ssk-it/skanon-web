import { readdirSync, readFileSync } from "node:fs";
import { join, relative } from "node:path";
import process from "node:process";
import { describe, expect, it } from "vitest";

/**
 * Every block that scrolls vertically carries `scrollbar-gutter: stable` — see `docs/practices.md`, "Page layout". The test reads the sources rather than the DOM: jsdom computes no layout, and a headless browser only has overlay scrollbars, which never take any width. The defect only shows with classic scrollbars; only reading the styles catches it everywhere.
 *
 * Read are: `.css` files, the `<style>` blocks of `.vue` components, and the `style="…"` attributes of their templates. The kit (`src/ui/`) being in source form, its dialogs, menus, choice lists and autocompletes are read like the rest — whereas, under Material, their list had to be kept separately.
 */

interface ScrollableBlock {
  source: string;
  line: number;
  selector: string;
  hasGutter: boolean;
}

const SCROLLS = /^(auto|scroll)$/;

/** True if the declarations make the block scroll vertically. */
function scrollsVertically(declarations: string): boolean {
  let scrolls = false;
  for (const declaration of declarations.split(";")) {
    const [ownership, ...rest] = declaration.split(":");
    const name = ownership?.trim().toLowerCase();
    const values = rest.join(":").replace("!important", "").trim().split(/\s+/);
    // `overflow: <x> <y>`: the second value, when it exists, applies to the height.
    if (name === "overflow")
      scrolls = SCROLLS.test(values[1] ?? values[0] ?? "");
    if (name === "overflow-y" || name === "overflow-block")
      scrolls = SCROLLS.test(values[0] ?? "");
  }
  return scrolls;
}

function hasStableGutter(declarations: string): boolean {
  return /(^|;)\s*scrollbar-gutter\s*:\s*stable\b/.test(declarations);
}

/**
 * Finds the scrolling blocks of a CSS sheet. CSS nests rules: only the declarations specific to a block count for it, not those of its children.
 */
export function listScrollableBlocks(
  css: string,
  source: string,
  startLine = 1,
): ScrollableBlock[] {
  // Comments are replaced by blanks of the same length, so that line numbers stay right.
  const text = css.replace(/\/\*[\s\S]*?\*\//g, (c) =>
    c.replace(/[^\n]/g, " "),
  );
  const blocks: ScrollableBlock[] = [];
  const stack: { selector: string; position: number; declarations: string }[] =
    [];
  let begin = 0;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (c === "{") {
      const selector = text.slice(begin, i).trim();
      stack.push({ selector, position: i, declarations: "" });
      begin = i + 1;
    } else if (c === "}") {
      const block = stack.pop();
      if (!block) continue;
      block.declarations += text.slice(begin, i);
      if (scrollsVertically(block.declarations)) {
        blocks.push({
          source,
          line:
            startLine + text.slice(0, block.position).split("\n").length - 1,
          selector: block.selector,
          hasGutter: hasStableGutter(block.declarations),
        });
      }
      begin = i + 1;
    } else if (c === ";" && stack.length > 0) {
      stack[stack.length - 1]!.declarations += text.slice(begin, i + 1);
      begin = i + 1;
    }
  }
  return blocks;
}

/** A template's inline styles: `style="…"` is a block on its own. */
export function listInlineStyles(
  template: string,
  source: string,
  startLine = 1,
): ScrollableBlock[] {
  const blocks: ScrollableBlock[] = [];
  for (const m of template.matchAll(/\sstyle\s*=\s*"([^"]*)"/g)) {
    const declarations = m[1] ?? "";
    if (!scrollsVertically(declarations)) continue;
    blocks.push({
      source,
      line: startLine + template.slice(0, m.index).split("\n").length - 1,
      selector: m[0].trim(),
      hasGutter: hasStableGutter(declarations),
    });
  }
  return blocks;
}

/** A component's `<style>` blocks, and the inline styles of its `<template>`. */
export function listComponentScrollableBlocks(
  sfc: string,
  source: string,
): ScrollableBlock[] {
  const lineOf = (index: number) => sfc.slice(0, index).split("\n").length;
  const blocks: ScrollableBlock[] = [];
  for (const m of sfc.matchAll(/(<style\b[^>]*>)([\s\S]*?)<\/style>/g)) {
    const begin = (m.index ?? 0) + (m[1] ?? "").length;
    blocks.push(...listScrollableBlocks(m[2] ?? "", source, lineOf(begin)));
  }
  const opening = /^<template\b[^>]*>/m.exec(sfc);
  const closing = sfc.lastIndexOf("</template>");
  if (opening && closing > opening.index) {
    const begin = opening.index + opening[0].length;
    blocks.push(
      ...listInlineStyles(sfc.slice(begin, closing), source, lineOf(begin)),
    );
  }
  return blocks;
}

function listFiles(folder: string): string[] {
  return readdirSync(folder, { withFileTypes: true }).flatMap((entry) => {
    const path = join(folder, entry.name);
    return entry.isDirectory() ? listFiles(path) : [path];
  });
}

/** `pnpm test` is run from the repo root, locally as in CI. */
const ROOT = join(process.cwd(), "src");

function listProjectScrollableBlocks(): ScrollableBlock[] {
  return listFiles(ROOT).flatMap((path) => {
    const source = relative(process.cwd(), path);
    const content = readFileSync(path, "utf8");
    if (path.endsWith(".css")) return listScrollableBlocks(content, source);
    if (path.endsWith(".vue"))
      return listComponentScrollableBlocks(content, source);
    return [];
  });
}

describe("scrollbar-gutter: stable on scrolling blocks", () => {
  it("finds a scrolling block, nested or not, and ignores horizontal scrolling", () => {
    const blocks = listScrollableBlocks(
      `
      .liste { overflow-y: auto; scrollbar-gutter: stable; }
      .panneau {
        color: red;
        .contenu { overflow: hidden auto; }
      }
      pre { overflow-x: auto; }
      .tronque { overflow: hidden; }
      /* .commentaire { overflow: auto; } */
      `,
      "exemple.css",
    );

    expect(blocks.map((b) => [b.selector, b.line, b.hasGutter])).toEqual([
      [".liste", 2, true],
      [".contenu", 5, false],
    ]);
  });

  it("finds a scrolling inline style", () => {
    const blocks = listInlineStyles(
      '<div style="max-height: 50vh; overflow: auto">',
      "exemple.vue",
    );

    expect(blocks).toHaveLength(1);
    expect(blocks[0]!.hasGutter).toBe(false);
  });

  it("reads a component's <style> blocks and template, at the right line number", () => {
    const blocks = listComponentScrollableBlocks(
      [
        '<script setup lang="ts">',
        'const css = ".faux { overflow: auto; }";',
        "</script>",
        "",
        "<template>",
        '  <div style="overflow-y: scroll"></div>',
        "</template>",
        "",
        "<style scoped>",
        ".liste {",
        "  overflow: auto;",
        "}",
        "</style>",
      ].join("\n"),
      "Exemple.vue",
    );

    expect(blocks.map((b) => [b.selector, b.line, b.hasGutter])).toEqual([
      [".liste", 10, false],
      ['style="overflow-y: scroll"', 6, false],
    ]);
  });

  it("finds scrolling blocks in the project", () => {
    // Without this guard, a read that no longer found anything would pass the next test without proving anything.
    expect(listProjectScrollableBlocks().length).toBeGreaterThanOrEqual(8);
  });

  it("reads the blocks the kit makes scroll: dialog, menu, choice list and autocomplete", () => {
    const selectors = listProjectScrollableBlocks().flatMap((b) =>
      b.selector.split(",").map((s) => s.trim()),
    );

    expect(selectors).toEqual(
      expect.arrayContaining([
        ".ui-dialog-panneau",
        ".ui-dialogue__contenu",
        ".ui-menu__panneau",
        ".ui-options",
      ]),
    );
  });

  it("requires the stable gutter on every scrolling block of the project", () => {
    const withoutGutter = listProjectScrollableBlocks()
      .filter((b) => !b.hasGutter)
      .map((b) => `${b.source}:${b.line} ${b.selector}`);

    expect(withoutGutter).toEqual([]);
  });
});
