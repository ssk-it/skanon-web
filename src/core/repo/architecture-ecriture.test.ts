import { describe, expect, it } from "vitest";
import { serializeCadrage } from "./redaction.service";
import type { CadrageEditable } from "./redaction.service";

/**
 * Ce qu'un cadrage écrit quand il vise une cible d'architecture.
 *
 * Le champ employé — `regle`, `adr` ou `architecture` — est ce qui dit au
 * vérificateur et à la propagation dans quel répertoire écrire. L'écrire
 * toujours comme `regle` produirait un fichier accepté à la saisie, refusé à la
 * livraison, et le rédacteur ne l'apprendrait qu'une fois sa demande ouverte.
 */
function cadrage(partiel: Partial<CadrageEditable>): CadrageEditable {
  return {
    titre: "Un cadrage",
    domaines: [],
    liens: [],
    impacts: [],
    objectif: "Un objectif.",
    parcours: "",
    sectionsLibres: [],
    ...partiel,
  } as unknown as CadrageEditable;
}

describe("écriture d’un impact vers une cible d’architecture", () => {
  it("écrit le champ correspondant à la nature visée", () => {
    const texte = serializeCadrage(
      "2026-001",
      cadrage({
        impacts: [
          {
            cible: "RG-a",
            nature: "regle",
            operation: "cree",
            enonce: "Une règle.",
          },
          {
            cible: "ADR-b",
            nature: "adr",
            operation: "cree",
            enonce: "Une décision.",
          },
          {
            cible: "FLX-c",
            nature: "architecture",
            operation: "modifie",
            enonce: "Un flux.",
          },
        ],
      }),
    );

    expect(texte).toContain("- { regle: RG-a, operation: cree }");
    expect(texte).toContain("- { adr: ADR-b, operation: cree }");
    expect(texte).toContain("- { architecture: FLX-c, operation: modifie }");
  });

  it("titre les énoncés par l’identifiant visé, quelle que soit la nature", () => {
    const texte = serializeCadrage(
      "2026-001",
      cadrage({
        impacts: [
          {
            cible: "ADR-b",
            nature: "adr",
            operation: "cree",
            enonce: "Une décision.",
          },
        ],
      }),
    );

    // La propagation retrouve l'énoncé par l'identifiant de la cible : un titre
    // portant autre chose la laisserait sans rien à écrire.
    expect(texte).toContain("### ADR-b");
    expect(texte).toContain("Une décision.");
  });

  it("écrit « regle » pour un impact dont la nature n’est pas renseignée", () => {
    // Les cadrages rédigés avant ce changement n'ont pas de nature. Les écrire
    // sans champ de cible produirait un impact que rien ne peut résoudre.
    const texte = serializeCadrage(
      "2026-001",
      cadrage({
        impacts: [{ cible: "RG-ancien", operation: "touche", enonce: "" }],
      } as Partial<CadrageEditable>),
    );

    expect(texte).toContain("- { regle: RG-ancien, operation: touche }");
  });
});
