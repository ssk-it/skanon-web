import { describe, expect, it } from "vitest";
import {
  extractOtherSections,
  extractFreeSections,
  extractSection,
  KNOWN_SECTIONS,
} from "./frontmatter";
import { serializeScoping } from "./authoring.service";

/**
 * Un cadrage porte ce que son auteur juge utile. Reconstruire le fichier à
 * partir des seules sections que l'éditeur présente les effacerait sans le
 * dire — c'est arrivé sur un cadrage réel, qui a perdu vingt-trois lignes de
 * questions ouvertes.
 */
const KNOWN = KNOWN_SECTIONS;

const BODY = `## Objectif

Ce qu'on cherche.

## Questions ouvertes

- **Qui peut déclarer ?** Reste à instruire.
- **Faut-il relancer ?** Le délai est de 72 heures.

## Parcours utilisateur

1. Il ouvre l'écran.

## Notes

Une note libre.
`;

describe("sections qu’un cadrage porte en propre", () => {
  it("rend celles que l’éditeur ne présente pas, titres compris", () => {
    const others = extractOtherSections(BODY, KNOWN);
    expect(others).toContain("## Questions ouvertes");
    expect(others).toContain("## Notes");
    expect(others).toContain("Qui peut déclarer");
  });

  it("écarte celles que l’éditeur sait déjà écrire", () => {
    const others = extractOtherSections(BODY, KNOWN);
    expect(others).not.toContain("## Objectif");
    expect(others).not.toContain("## Parcours utilisateur");
  });

  it("rend une chaîne vide quand tout est connu", () => {
    expect(extractOtherSections("## Objectif\n\nX.\n", KNOWN)).toBe("");
  });

  it("les conserve à la réécriture", () => {
    // Le cas qui a échoué en vrai : réenregistrer sans y toucher.
    const out = serializeScoping("2026-001", {
      title: "Un cadrage",
      domains: ["contrats"],
      goal: "Ce qu’on cherche.",
      journey: "1. Il ouvre l’écran.",
      impacts: [],
      unknownSections: extractOtherSections(BODY, KNOWN),
    });

    expect(out).toContain("## Questions ouvertes");
    expect(out).toContain("Faut-il relancer");
    expect(out).toContain("## Notes");
    expect(extractSection(out, "Objectif")).toContain("cherche");
  });

  it("n’écrit rien de superflu quand il n’y a pas de section en propre", () => {
    const out = serializeScoping("2026-001", {
      title: "Un cadrage",
      domains: [],
      goal: "X.",
      journey: "Y.",
      impacts: [],
      unknownSections: "",
    });
    expect(out.trimEnd().endsWith("Y.")).toBe(true);
  });

  it("reste stable d’un enregistrement à l’autre", () => {
    // Le défaut trouvé en vrai : le fichier gagnait une ligne vide à chaque
    // enregistrement, l'espace du séparateur s'ajoutant à celui que le bloc
    // portait déjà. Réextraire ce qu'on vient d'écrire doit rendre l'identique.
    const write = (others: string) =>
      serializeScoping("2026-001", {
        title: "Un cadrage",
        domains: [],
        goal: "X.",
        journey: "Y.",
        impacts: [],
        unknownSections: others,
      });

    const first = write(extractOtherSections(BODY, KNOWN));
    const second = write(extractOtherSections(first, KNOWN));
    expect(second).toBe(first);
  });

  it("survit à un cadrage sans aucune section", () => {
    expect(extractOtherSections("", KNOWN)).toBe("");
    expect(extractOtherSections("Du texte sans titre.", KNOWN)).toBe("");
  });
});

/**
 * Les préserver ne suffisait pas : écrites et jamais montrées, elles étaient
 * perdues pour le lecteur. La fiche les rassemble sous « Divers », d'où le
 * découpage titre par titre — le titre d'origine dit de quoi la section parle.
 */
describe("sections rassemblées sous « Divers »", () => {
  it("rend chaque section libre avec son titre et son corps", () => {
    const free = extractFreeSections(BODY, KNOWN);

    expect(free.map((s) => s.title)).toEqual(["Questions ouvertes", "Notes"]);
    expect(free[0].body).toContain("Qui peut déclarer");
    expect(free[0].body).not.toContain("##");
    expect(free[1].body).toBe("Une note libre.");
  });

  it("garde les sous-sections de niveau 3 dans le corps qui les porte", () => {
    // Le cas qui a motivé l'écran : une observation écrite en « ### » sous une
    // section libre. Découper au niveau 3 l'aurait sortie de son contexte.
    const body = `## Ce que la mesure a montré

Le relevé.

### Une observation, hors périmètre

Ce qu'elle dit.
`;
    const [section] = extractFreeSections(body, KNOWN);

    expect(section.title).toBe("Ce que la mesure a montré");
    expect(section.body).toContain("### Une observation, hors périmètre");
    expect(section.body).toContain("Ce qu'elle dit.");
  });

  it("ne rend rien quand tout est connu", () => {
    expect(extractFreeSections("## Objectif\n\nX.\n", KNOWN)).toEqual([]);
    expect(extractFreeSections("", KNOWN)).toEqual([]);
  });

  it("dit la même chose que le texte préservé à la réécriture", () => {
    // Les deux sorties viennent du même découpage : si elles divergeaient, la
    // fiche montrerait autre chose que ce que l'enregistrement conserve.
    const expected = extractFreeSections(BODY, KNOWN)
      .map((s) => `## ${s.title}\n\n${s.body}`)
      .join("\n\n");

    expect(extractOtherSections(BODY, KNOWN)).toBe(expected);
  });
});
