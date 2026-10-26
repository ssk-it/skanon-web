import { readdirSync, readFileSync } from "node:fs";
import { join, relative } from "node:path";
import process from "node:process";
import { describe, expect, it } from "vitest";

/**
 * Chaque bloc qui défile verticalement porte `scrollbar-gutter: stable` — voir `docs/pratiques.md`, « La mise en page ». Le test lit les sources plutôt que le DOM : jsdom ne calcule aucune mise en page, et un navigateur sans tête n'a que des barres superposées, qui ne prennent jamais de largeur. Le défaut ne se voit qu'avec des barres classiques ; seule la lecture des styles l'attrape partout.
 *
 * Sont lus : les fichiers `.css`, les blocs `<style>` des composants `.vue`, et les attributs `style="…"` de leurs gabarits. Le kit (`src/ui/`) étant en sources, ses dialogues, menus, listes de choix et autocomplétions sont lus comme le reste — là où, sous Material, il fallait en tenir la liste à part.
 */

interface ScrollableBlock {
  source: string;
  line: number;
  selector: string;
  hasGutter: boolean;
}

const SCROLLS = /^(auto|scroll)$/;

/** Vrai si les déclarations font défiler le bloc en hauteur. */
function scrollsVertically(declarations: string): boolean {
  let scrolls = false;
  for (const declaration of declarations.split(";")) {
    const [ownership, ...rest] = declaration.split(":");
    const name = ownership?.trim().toLowerCase();
    const values = rest.join(":").replace("!important", "").trim().split(/\s+/);
    // `overflow: <x> <y>` : la seconde valeur, quand elle existe, vaut pour la hauteur.
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
 * Relève les blocs défilants d'une feuille CSS. Le CSS imbrique les règles : seules les déclarations propres à un bloc comptent pour lui, celles de ses enfants non.
 */
export function listScrollableBlocks(
  css: string,
  source: string,
  startLine = 1,
): ScrollableBlock[] {
  // Les commentaires sont remplacés par des blancs de même longueur, pour que les numéros de ligne restent justes.
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

/** Les styles en ligne d'un gabarit : `style="…"` est un bloc à lui seul. */
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

/** Les blocs `<style>` d'un composant, et les styles en ligne de son `<template>`. */
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

/** `pnpm test` se lance depuis la racine du dépôt, en local comme en CI. */
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

describe("scrollbar-gutter: stable sur les blocs qui défilent", () => {
  it("relève un bloc défilant, imbriqué ou non, et ignore le défilement en largeur", () => {
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

  it("relève un style en ligne défilant", () => {
    const blocks = listInlineStyles(
      '<div style="max-height: 50vh; overflow: auto">',
      "exemple.vue",
    );

    expect(blocks).toHaveLength(1);
    expect(blocks[0]!.hasGutter).toBe(false);
  });

  it("lit les blocs <style> et le gabarit d’un composant, au bon numéro de ligne", () => {
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

  it("trouve des blocs défilants dans le projet", () => {
    // Sans cette garde, une lecture qui ne trouverait plus rien passerait le test suivant sans rien prouver.
    expect(listProjectScrollableBlocks().length).toBeGreaterThanOrEqual(8);
  });

  it("lit les blocs que le kit fait défiler : dialogue, menu, liste de choix et autocomplétion", () => {
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

  it("exige la gouttière stable de chaque bloc défilant du projet", () => {
    const withoutGutter = listProjectScrollableBlocks()
      .filter((b) => !b.hasGutter)
      .map((b) => `${b.source}:${b.line} ${b.selector}`);

    expect(withoutGutter).toEqual([]);
  });
});
