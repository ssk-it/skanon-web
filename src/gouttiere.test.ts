import { readdirSync, readFileSync } from "node:fs";
import { join, relative } from "node:path";
import process from "node:process";
import { describe, expect, it } from "vitest";

/**
 * Chaque bloc qui défile verticalement porte `scrollbar-gutter: stable` — voir `docs/pratiques.md`, « La mise en page ». Le test lit les sources plutôt que le DOM : jsdom ne calcule aucune mise en page, et un navigateur sans tête n'a que des barres superposées, qui ne prennent jamais de largeur. Le défaut ne se voit qu'avec des barres classiques ; seule la lecture des styles l'attrape partout.
 *
 * Sont lus : les fichiers `.css`, les blocs `<style>` des composants `.vue`, et les attributs `style="…"` de leurs gabarits. Le kit (`src/ui/`) étant en sources, ses dialogues, menus, listes de choix et autocomplétions sont lus comme le reste — là où, sous Material, il fallait en tenir la liste à part.
 */

interface BlocDefilant {
  source: string;
  ligne: number;
  selecteur: string;
  aGouttiere: boolean;
}

const DEFILE = /^(auto|scroll)$/;

/** Vrai si les déclarations font défiler le bloc en hauteur. */
function defileVerticalement(declarations: string): boolean {
  let defile = false;
  for (const declaration of declarations.split(";")) {
    const [propriete, ...reste] = declaration.split(":");
    const nom = propriete?.trim().toLowerCase();
    const valeurs = reste
      .join(":")
      .replace("!important", "")
      .trim()
      .split(/\s+/);
    // `overflow: <x> <y>` : la seconde valeur, quand elle existe, vaut pour la hauteur.
    if (nom === "overflow")
      defile = DEFILE.test(valeurs[1] ?? valeurs[0] ?? "");
    if (nom === "overflow-y" || nom === "overflow-block")
      defile = DEFILE.test(valeurs[0] ?? "");
  }
  return defile;
}

function aGouttiereStable(declarations: string): boolean {
  return /(^|;)\s*scrollbar-gutter\s*:\s*stable\b/.test(declarations);
}

/**
 * Relève les blocs défilants d'une feuille CSS. Le CSS imbrique les règles : seules les déclarations propres à un bloc comptent pour lui, celles de ses enfants non.
 */
export function listBlocsDefilants(
  css: string,
  source: string,
  ligneDepart = 1,
): BlocDefilant[] {
  // Les commentaires sont remplacés par des blancs de même longueur, pour que les numéros de ligne restent justes.
  const texte = css.replace(/\/\*[\s\S]*?\*\//g, (c) =>
    c.replace(/[^\n]/g, " "),
  );
  const blocs: BlocDefilant[] = [];
  const pile: { selecteur: string; position: number; declarations: string }[] =
    [];
  let debut = 0;
  for (let i = 0; i < texte.length; i++) {
    const c = texte[i];
    if (c === "{") {
      const selecteur = texte.slice(debut, i).trim();
      pile.push({ selecteur, position: i, declarations: "" });
      debut = i + 1;
    } else if (c === "}") {
      const bloc = pile.pop();
      if (!bloc) continue;
      bloc.declarations += texte.slice(debut, i);
      if (defileVerticalement(bloc.declarations)) {
        blocs.push({
          source,
          ligne:
            ligneDepart + texte.slice(0, bloc.position).split("\n").length - 1,
          selecteur: bloc.selecteur,
          aGouttiere: aGouttiereStable(bloc.declarations),
        });
      }
      debut = i + 1;
    } else if (c === ";" && pile.length > 0) {
      pile[pile.length - 1]!.declarations += texte.slice(debut, i + 1);
      debut = i + 1;
    }
  }
  return blocs;
}

/** Les styles en ligne d'un gabarit : `style="…"` est un bloc à lui seul. */
export function listStylesEnLigne(
  gabarit: string,
  source: string,
  ligneDepart = 1,
): BlocDefilant[] {
  const blocs: BlocDefilant[] = [];
  for (const m of gabarit.matchAll(/\sstyle\s*=\s*"([^"]*)"/g)) {
    const declarations = m[1] ?? "";
    if (!defileVerticalement(declarations)) continue;
    blocs.push({
      source,
      ligne: ligneDepart + gabarit.slice(0, m.index).split("\n").length - 1,
      selecteur: m[0].trim(),
      aGouttiere: aGouttiereStable(declarations),
    });
  }
  return blocs;
}

/** Les blocs `<style>` d'un composant, et les styles en ligne de son `<template>`. */
export function listBlocsDefilantsDeComposant(
  sfc: string,
  source: string,
): BlocDefilant[] {
  const ligneDe = (index: number) => sfc.slice(0, index).split("\n").length;
  const blocs: BlocDefilant[] = [];
  for (const m of sfc.matchAll(/(<style\b[^>]*>)([\s\S]*?)<\/style>/g)) {
    const debut = (m.index ?? 0) + (m[1] ?? "").length;
    blocs.push(...listBlocsDefilants(m[2] ?? "", source, ligneDe(debut)));
  }
  const ouverture = /^<template\b[^>]*>/m.exec(sfc);
  const fermeture = sfc.lastIndexOf("</template>");
  if (ouverture && fermeture > ouverture.index) {
    const debut = ouverture.index + ouverture[0].length;
    blocs.push(
      ...listStylesEnLigne(sfc.slice(debut, fermeture), source, ligneDe(debut)),
    );
  }
  return blocs;
}

function listFichiers(dossier: string): string[] {
  return readdirSync(dossier, { withFileTypes: true }).flatMap((entree) => {
    const chemin = join(dossier, entree.name);
    return entree.isDirectory() ? listFichiers(chemin) : [chemin];
  });
}

/** `pnpm test` se lance depuis la racine du dépôt, en local comme en CI. */
const RACINE = join(process.cwd(), "src");

function listBlocsDefilantsDuProjet(): BlocDefilant[] {
  return listFichiers(RACINE).flatMap((chemin) => {
    const source = relative(process.cwd(), chemin);
    const contenu = readFileSync(chemin, "utf8");
    if (chemin.endsWith(".css")) return listBlocsDefilants(contenu, source);
    if (chemin.endsWith(".vue"))
      return listBlocsDefilantsDeComposant(contenu, source);
    return [];
  });
}

describe("scrollbar-gutter: stable sur les blocs qui défilent", () => {
  it("relève un bloc défilant, imbriqué ou non, et ignore le défilement en largeur", () => {
    const blocs = listBlocsDefilants(
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

    expect(blocs.map((b) => [b.selecteur, b.ligne, b.aGouttiere])).toEqual([
      [".liste", 2, true],
      [".contenu", 5, false],
    ]);
  });

  it("relève un style en ligne défilant", () => {
    const blocs = listStylesEnLigne(
      '<div style="max-height: 50vh; overflow: auto">',
      "exemple.vue",
    );

    expect(blocs).toHaveLength(1);
    expect(blocs[0]!.aGouttiere).toBe(false);
  });

  it("lit les blocs <style> et le gabarit d’un composant, au bon numéro de ligne", () => {
    const blocs = listBlocsDefilantsDeComposant(
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

    expect(blocs.map((b) => [b.selecteur, b.ligne, b.aGouttiere])).toEqual([
      [".liste", 10, false],
      ['style="overflow-y: scroll"', 6, false],
    ]);
  });

  it("trouve des blocs défilants dans le projet", () => {
    // Sans cette garde, une lecture qui ne trouverait plus rien passerait le test suivant sans rien prouver.
    expect(listBlocsDefilantsDuProjet().length).toBeGreaterThanOrEqual(8);
  });

  it("lit les blocs que le kit fait défiler : dialogue, menu, liste de choix et autocomplétion", () => {
    const selecteurs = listBlocsDefilantsDuProjet().flatMap((b) =>
      b.selecteur.split(",").map((s) => s.trim()),
    );

    expect(selecteurs).toEqual(
      expect.arrayContaining([
        ".ui-dialog-panneau",
        ".ui-dialogue__contenu",
        ".ui-menu__panneau",
        ".ui-options",
      ]),
    );
  });

  it("exige la gouttière stable de chaque bloc défilant du projet", () => {
    const sansGouttiere = listBlocsDefilantsDuProjet()
      .filter((b) => !b.aGouttiere)
      .map((b) => `${b.source}:${b.ligne} ${b.selecteur}`);

    expect(sansGouttiere).toEqual([]);
  });
});
