import { describe, expect, it } from "vitest";
import { serializeScoping } from "./redaction.service";
import type { EditableScoping } from "./redaction.service";

/**
 * Ce qu'un cadrage écrit quand il vise une cible d'architecture.
 *
 * Le champ employé — `regle`, `adr` ou `architecture` — est ce qui dit au
 * vérificateur et à la propagation dans quel répertoire écrire. L'écrire
 * toujours comme `regle` produirait un fichier accepté à la saisie, refusé à la
 * livraison, et le rédacteur ne l'apprendrait qu'une fois sa demande ouverte.
 */
function scoping(partial: Partial<EditableScoping>): EditableScoping {
  return {
    title: "Un cadrage",
    domains: [],
    links: [],
    impacts: [],
    goal: "Un objectif.",
    journey: "",
    freeSections: [],
    ...partial,
  } as unknown as EditableScoping;
}

describe("écriture d’un impact vers une cible d’architecture", () => {
  it("écrit le champ correspondant à la nature visée", () => {
    const text = serializeScoping(
      "2026-001",
      scoping({
        impacts: [
          {
            target: "RG-a",
            kind: "regle",
            operation: "cree",
            statement: "Une règle.",
          },
          {
            target: "ADR-b",
            kind: "adr",
            operation: "cree",
            statement: "Une décision.",
          },
          {
            target: "FLX-c",
            kind: "architecture",
            operation: "modifie",
            statement: "Un flux.",
          },
        ],
      }),
    );

    expect(text).toContain("- { regle: RG-a, operation: cree }");
    expect(text).toContain("- { adr: ADR-b, operation: cree }");
    expect(text).toContain("- { architecture: FLX-c, operation: modifie }");
  });

  it("titre les énoncés par l’identifiant visé, quelle que soit la nature", () => {
    const text = serializeScoping(
      "2026-001",
      scoping({
        impacts: [
          {
            target: "ADR-b",
            kind: "adr",
            operation: "cree",
            statement: "Une décision.",
          },
        ],
      }),
    );

    // La propagation retrouve l'énoncé par l'identifiant de la cible : un titre
    // portant autre chose la laisserait sans rien à écrire.
    expect(text).toContain("### ADR-b");
    expect(text).toContain("Une décision.");
  });

  it("écrit « regle » pour un impact dont la nature n’est pas renseignée", () => {
    // Les cadrages rédigés avant ce changement n'ont pas de nature. Les écrire
    // sans champ de cible produirait un impact que rien ne peut résoudre.
    const text = serializeScoping(
      "2026-001",
      scoping({
        impacts: [{ target: "RG-ancien", operation: "touche", statement: "" }],
      } as Partial<EditableScoping>),
    );

    expect(text).toContain("- { regle: RG-ancien, operation: touche }");
  });
});
