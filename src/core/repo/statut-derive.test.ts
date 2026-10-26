import { describe, expect, it } from "vitest";
import { deriverStatut } from "./statut-derive";
import { ProvenanceCadrage } from "../model/model";

describe("deriverStatut", () => {
  const surBranche = (
    p: Partial<ProvenanceCadrage> = {},
  ): ProvenanceCadrage => ({
    branche: "cadrage/2026-001",
    pullRequest: 7,
    brouillon: false,
    ...p,
  });

  it("tient pour livré ce que porte la branche principale", () => {
    // Pas de provenance : le chargeur ne la pose que sur les branches de demande.
    expect(deriverStatut(undefined)).toBe("livree");
  });

  it("rend « brouillon » quand la demande est en brouillon", () => {
    expect(deriverStatut(surBranche({ brouillon: true }))).toBe("brouillon");
  });

  it("rend « en_relecture » quand la demande est ouverte sans avis rendu", () => {
    expect(deriverStatut(surBranche({ approbation: "REVIEW_REQUIRED" }))).toBe(
      "en_relecture",
    );
  });

  it("rend « validee » quand la demande est approuvée", () => {
    expect(deriverStatut(surBranche({ approbation: "APPROVED" }))).toBe(
      "validee",
    );
  });

  it("reste en relecture quand des changements sont demandés", () => {
    expect(
      deriverStatut(surBranche({ approbation: "CHANGES_REQUESTED" })),
    ).toBe("en_relecture");
  });

  it("ne déduit aucune validation d’une approbation inconnue", () => {
    // `null` dit « je ne sais pas » — une lecture REST, ou un appel en échec —
    // et non « pas approuvée ». Conclure « validee » y serait un mensonge.
    expect(deriverStatut(surBranche({ approbation: null }))).toBe(
      "en_relecture",
    );
    expect(deriverStatut(surBranche())).toBe("en_relecture");
  });

  it("donne le brouillon la priorité sur une approbation", () => {
    // Une demande approuvée puis repassée en brouillon n'est plus à relire :
    // son auteur l'a reprise, et c'est ce qu'il faut montrer.
    expect(
      deriverStatut(surBranche({ brouillon: true, approbation: "APPROVED" })),
    ).toBe("brouillon");
  });
});
