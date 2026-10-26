import { describe, expect, it } from "vitest";
import { deriveStatus } from "./statut-derive";
import { ScopingProvenance } from "../model/model";

describe("deriverStatut", () => {
  const onBranch = (p: Partial<ScopingProvenance> = {}): ScopingProvenance => ({
    branch: "cadrage/2026-001",
    pullRequest: 7,
    draft: false,
    ...p,
  });

  it("tient pour livré ce que porte la branche principale", () => {
    // Pas de provenance : le chargeur ne la pose que sur les branches de demande.
    expect(deriveStatus(undefined)).toBe("livree");
  });

  it("rend « brouillon » quand la demande est en brouillon", () => {
    expect(deriveStatus(onBranch({ draft: true }))).toBe("brouillon");
  });

  it("rend « en_relecture » quand la demande est ouverte sans avis rendu", () => {
    expect(deriveStatus(onBranch({ approval: "REVIEW_REQUIRED" }))).toBe(
      "en_relecture",
    );
  });

  it("rend « validee » quand la demande est approuvée", () => {
    expect(deriveStatus(onBranch({ approval: "APPROVED" }))).toBe("validee");
  });

  it("reste en relecture quand des changements sont demandés", () => {
    expect(deriveStatus(onBranch({ approval: "CHANGES_REQUESTED" }))).toBe(
      "en_relecture",
    );
  });

  it("ne déduit aucune validation d’une approbation inconnue", () => {
    // `null` dit « je ne sais pas » — une lecture REST, ou un appel en échec —
    // et non « pas approuvée ». Conclure « validee » y serait un mensonge.
    expect(deriveStatus(onBranch({ approval: null }))).toBe("en_relecture");
    expect(deriveStatus(onBranch())).toBe("en_relecture");
  });

  it("donne le brouillon la priorité sur une approbation", () => {
    // Une demande approuvée puis repassée en brouillon n'est plus à relire :
    // son auteur l'a reprise, et c'est ce qu'il faut montrer.
    expect(deriveStatus(onBranch({ draft: true, approval: "APPROVED" }))).toBe(
      "brouillon",
    );
  });
});
