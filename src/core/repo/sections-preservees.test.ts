import { describe, expect, it } from "vitest";
import {
  extractSectionsAutres,
  extractSectionsLibres,
  extractSection,
  SECTIONS_CONNUES,
} from "./frontmatter";
import { serializeCadrage } from "./redaction.service";

/**
 * Un cadrage porte ce que son auteur juge utile. Reconstruire le fichier à
 * partir des seules sections que l'éditeur présente les effacerait sans le
 * dire — c'est arrivé sur un cadrage réel, qui a perdu vingt-trois lignes de
 * questions ouvertes.
 */
const CONNUES = SECTIONS_CONNUES;

const CORPS = `## Objectif

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
    const autres = extractSectionsAutres(CORPS, CONNUES);
    expect(autres).toContain("## Questions ouvertes");
    expect(autres).toContain("## Notes");
    expect(autres).toContain("Qui peut déclarer");
  });

  it("écarte celles que l’éditeur sait déjà écrire", () => {
    const autres = extractSectionsAutres(CORPS, CONNUES);
    expect(autres).not.toContain("## Objectif");
    expect(autres).not.toContain("## Parcours utilisateur");
  });

  it("rend une chaîne vide quand tout est connu", () => {
    expect(extractSectionsAutres("## Objectif\n\nX.\n", CONNUES)).toBe("");
  });

  it("les conserve à la réécriture", () => {
    // Le cas qui a échoué en vrai : réenregistrer sans y toucher.
    const out = serializeCadrage("2026-001", {
      titre: "Un cadrage",
      domaines: ["contrats"],
      objectif: "Ce qu’on cherche.",
      parcours: "1. Il ouvre l’écran.",
      impacts: [],
      sectionsInconnues: extractSectionsAutres(CORPS, CONNUES),
    });

    expect(out).toContain("## Questions ouvertes");
    expect(out).toContain("Faut-il relancer");
    expect(out).toContain("## Notes");
    expect(extractSection(out, "Objectif")).toContain("cherche");
  });

  it("n’écrit rien de superflu quand il n’y a pas de section en propre", () => {
    const out = serializeCadrage("2026-001", {
      titre: "Un cadrage",
      domaines: [],
      objectif: "X.",
      parcours: "Y.",
      impacts: [],
      sectionsInconnues: "",
    });
    expect(out.trimEnd().endsWith("Y.")).toBe(true);
  });

  it("reste stable d’un enregistrement à l’autre", () => {
    // Le défaut trouvé en vrai : le fichier gagnait une ligne vide à chaque
    // enregistrement, l'espace du séparateur s'ajoutant à celui que le bloc
    // portait déjà. Réextraire ce qu'on vient d'écrire doit rendre l'identique.
    const ecrire = (autres: string) =>
      serializeCadrage("2026-001", {
        titre: "Un cadrage",
        domaines: [],
        objectif: "X.",
        parcours: "Y.",
        impacts: [],
        sectionsInconnues: autres,
      });

    const premier = ecrire(extractSectionsAutres(CORPS, CONNUES));
    const second = ecrire(extractSectionsAutres(premier, CONNUES));
    expect(second).toBe(premier);
  });

  it("survit à un cadrage sans aucune section", () => {
    expect(extractSectionsAutres("", CONNUES)).toBe("");
    expect(extractSectionsAutres("Du texte sans titre.", CONNUES)).toBe("");
  });
});

/**
 * Les préserver ne suffisait pas : écrites et jamais montrées, elles étaient
 * perdues pour le lecteur. La fiche les rassemble sous « Divers », d'où le
 * découpage titre par titre — le titre d'origine dit de quoi la section parle.
 */
describe("sections rassemblées sous « Divers »", () => {
  it("rend chaque section libre avec son titre et son corps", () => {
    const libres = extractSectionsLibres(CORPS, CONNUES);

    expect(libres.map((s) => s.titre)).toEqual(["Questions ouvertes", "Notes"]);
    expect(libres[0].corps).toContain("Qui peut déclarer");
    expect(libres[0].corps).not.toContain("##");
    expect(libres[1].corps).toBe("Une note libre.");
  });

  it("garde les sous-sections de niveau 3 dans le corps qui les porte", () => {
    // Le cas qui a motivé l'écran : une observation écrite en « ### » sous une
    // section libre. Découper au niveau 3 l'aurait sortie de son contexte.
    const corps = `## Ce que la mesure a montré

Le relevé.

### Une observation, hors périmètre

Ce qu'elle dit.
`;
    const [section] = extractSectionsLibres(corps, CONNUES);

    expect(section.titre).toBe("Ce que la mesure a montré");
    expect(section.corps).toContain("### Une observation, hors périmètre");
    expect(section.corps).toContain("Ce qu'elle dit.");
  });

  it("ne rend rien quand tout est connu", () => {
    expect(extractSectionsLibres("## Objectif\n\nX.\n", CONNUES)).toEqual([]);
    expect(extractSectionsLibres("", CONNUES)).toEqual([]);
  });

  it("dit la même chose que le texte préservé à la réécriture", () => {
    // Les deux sorties viennent du même découpage : si elles divergeaient, la
    // fiche montrerait autre chose que ce que l'enregistrement conserve.
    const attendu = extractSectionsLibres(CORPS, CONNUES)
      .map((s) => `## ${s.titre}\n\n${s.corps}`)
      .join("\n\n");

    expect(extractSectionsAutres(CORPS, CONNUES)).toBe(attendu);
  });
});
