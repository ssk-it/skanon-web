import { describe, expect, it } from "vitest";
import { buildExtrait } from "./FonctionnalitePage.vue";

/**
 * L'extrait d'une règle, sous son identifiant dans la fiche d'une fonctionnalité.
 *
 * Les énoncés du référentiel sont coupés vers 80 colonnes : une ligne du fichier n'est pas une phrase. L'extrait recolle le premier paragraphe et en garde la première phrase.
 */
describe("buildExtrait", () => {
  it("recolle une phrase coupée sur plusieurs lignes", () => {
    const enonce = `L'application **dit elle-même ce qu'elle fait** de ce qu'on lui confie : où
vont les jetons, et chaque hôte qu'elle contacte.

Ce qu'elle en dit est une annonce.
`;

    expect(buildExtrait(enonce)).toBe(
      "L'application dit elle-même ce qu'elle fait de ce qu'on lui confie : où vont les jetons, et chaque hôte qu'elle contacte.",
    );
  });

  it("s'arrête à la fin de la première phrase", () => {
    const enonce = `L'aide a sa propre adresse, \`/aide\`. Elle est hors de tout
projet, comme l'accueil.
`;

    expect(buildExtrait(enonce)).toBe("L'aide a sa propre adresse, /aide.");
  });

  it("ne déborde pas sur le paragraphe suivant quand le premier n'a pas de point", () => {
    const enonce = `

Une barre du bas, présente sur tous les écrans
- porte ce qu'on ne cherche pas

Un autre paragraphe.
`;

    expect(buildExtrait(enonce)).toBe(
      "Une barre du bas, présente sur tous les écrans - porte ce qu'on ne cherche pas",
    );
  });

  it("ne coupe pas sur un point qui n'est pas suivi d'un blanc", () => {
    expect(buildExtrait("Le format 1.5 reste lu. La suite.")).toBe(
      "Le format 1.5 reste lu.",
    );
  });

  it("rend une chaîne vide pour un énoncé vide", () => {
    expect(buildExtrait("\n\n")).toBe("");
  });
});
