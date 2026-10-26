import { describe, expect, it } from "vitest";
import {
  splitFrontmatter,
  isUnreadable,
  extractSection,
  extractStatements,
  extractSubsections,
} from "./frontmatter";

/** Lit un fichier dont on sait le frontmatter valide. */
function read(text: string) {
  const r = splitFrontmatter(text);
  if (!r || isUnreadable(r)) throw new Error("frontmatter attendu valide");
  return r;
}

/**
 * Ces tests portent sur le format lui-même, pas sur du code d'infrastructure.
 * Le parseur existe en double — ici et dans `actions/src/parse.mjs` — et le
 * risque de divergence est identifié : ces cas sont ceux qui doivent se
 * comporter à l'identique des deux côtés.
 */
describe("frontmatter", () => {
  const FILE = `---
id: RG-exemple
statut: actif
fonctionnalites: [une, deux]
---

## Objectif

Le texte de l'objectif.

## Énoncés

### RG-premiere

Premier énoncé.

### RG-seconde

Second énoncé, sur
plusieurs lignes.
`;

  it("sépare le frontmatter du corps", () => {
    const r = read(FILE);
    expect(r.data["id"]).toBe("RG-exemple");
    expect(r.data["fonctionnalites"]).toEqual(["une", "deux"]);
    expect(r.body.startsWith("\n## Objectif")).toBe(true);
  });

  it("retourne null sans frontmatter", () => {
    expect(splitFrontmatter("# Juste du markdown")).toBeNull();
  });

  it("signale un YAML invalide plutôt que de le confondre avec une absence", () => {
    // « absent » et « illisible » demandent deux corrections différentes, et
    // seule la seconde peut dire où corriger
    const r = splitFrontmatter("---\nid: [non fermé\n---\ncorps");
    expect(r).not.toBeNull();
    expect(isUnreadable(r)).toBe(true);
  });

  it("situe la ligne fautive dans le fichier, pas dans le bloc", () => {
    const r = splitFrontmatter(
      "---\nid: x\ntitre: Un titre : deux-points\n---\ncorps",
    );
    expect(isUnreadable(r) && r.error).toContain("ligne 3");
  });

  it("dit quoi faire d’un « : » non quoté, la faute la plus fréquente", () => {
    const r = splitFrontmatter(
      "---\ntitre: Choisir : ceci ou cela\n---\ncorps",
    );
    expect(isUnreadable(r) && r.error).toContain("apostrophes");
  });

  it("accepte les fins de ligne Windows", () => {
    expect(read("---\r\nid: x\r\n---\r\ncorps").data["id"]).toBe("x");
  });

  it("extrait une section de niveau 2", () => {
    const { body } = read(FILE);
    expect(extractSection(body, "Objectif")).toBe("Le texte de l'objectif.");
  });

  it("retourne une chaîne vide pour une section absente", () => {
    const { body } = read(FILE);
    expect(extractSection(body, "Parcours utilisateur")).toBe("");
  });

  it("extrait les énoncés par identifiant de règle", () => {
    const { body } = read(FILE);
    const e = extractStatements(body);
    expect([...e.keys()]).toEqual(["RG-premiere", "RG-seconde"]);
    expect(e.get("RG-premiere")).toBe("Premier énoncé.");
    expect(e.get("RG-seconde")).toBe("Second énoncé, sur\nplusieurs lignes.");
  });

  it("gère un accent dans le titre de section", () => {
    // « Énoncés » porte un accent : l'échappement de la regex doit tenir
    const e = extractStatements("## Énoncés\n\n### RG-x\n\nTexte.\n");
    expect(e.get("RG-x")).toBe("Texte.");
  });

  it("ne confond pas une section suivante avec un énoncé", () => {
    const body =
      "## Énoncés\n\n### RG-a\n\nA.\n\n## Autre section\n\nPas un énoncé.\n";
    const e = extractStatements(body);
    expect([...e.keys()]).toEqual(["RG-a"]);
    expect(e.get("RG-a")).toBe("A.");
  });

  it("découpe les options d’une décision", () => {
    const body =
      "## Options\n\n### option-a\n\nPour A.\n\n### option-b\n\nPour B.\n";
    const o = extractSubsections(body, "Options");
    expect([...o.keys()]).toEqual(["option-a", "option-b"]);
    expect(o.get("option-b")).toBe("Pour B.");
  });
});
