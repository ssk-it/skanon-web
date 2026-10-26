import { beforeEach, describe, expect, it } from "vitest";
import { inject, resetInjection } from "../injection";
import type { Rule, Specification } from "../model/model";
import { VerificationService, type ScopingInput } from "./verification.service";

/**
 * La vérification pendant la rédaction, par `checkRepo` de `@ssk-it/canon-check`. Le vérificateur lit les entités sous les noms du format (`domaines`, `statut`, `enonces`, `regle`…), le modèle les nomme en anglais : ces cas éprouvent la correspondance, qui ne se voit à aucune compilation.
 */
describe("vérification d'un cadrage en cours de rédaction", () => {
  function rule(id: string, status: Rule["status"]): Rule {
    return {
      id,
      status,
      features: ["f-saisie"],
      statement: `Énoncé de ${id}.`,
      createdBy: null,
      modifiedBy: [],
    };
  }

  const SPECIFICATION = {
    domains: new Map([
      ["d-cadrage", { id: "d-cadrage", name: "Cadrage", description: "" }],
    ]),
    features: new Map([
      [
        "f-saisie",
        {
          id: "f-saisie",
          name: "Saisie",
          domains: ["d-cadrage"],
          description: "",
        },
      ],
    ]),
    rules: new Map([
      ["RG-active", rule("RG-active", "actif")],
      ["RG-abrogee", rule("RG-abrogee", "abroge")],
    ]),
    decisions: new Map(),
    architecture: new Map(),
    scopings: new Map(),
  } as unknown as Specification;

  function input(partial: Partial<ScopingInput> = {}): ScopingInput {
    return {
      id: "2026-070",
      title: "Un cadrage",
      domains: ["d-cadrage"],
      impacts: [{ target: "RG-active", kind: "regle", operation: "modifie" }],
      statements: new Map([["RG-active", "Nouvel énoncé."]]),
      ...partial,
    };
  }

  let service: VerificationService;

  beforeEach(() => {
    resetInjection();
    service = inject(VerificationService);
  });

  it("ne reproche rien à un cadrage cohérent avec le référentiel", () => {
    expect(service.checkScoping(input(), SPECIFICATION).errors).toEqual([]);
  });

  it("trouve la cible de chaque impact sous sa nature", () => {
    const { errors } = service.checkScoping(input(), SPECIFICATION);
    expect(errors.join("\n")).not.toContain("impact sans cible");
  });

  it("signale un domaine que le référentiel ne connaît pas", () => {
    const { errors, warnings } = service.checkScoping(
      input({ domains: ["d-inconnu"] }),
      SPECIFICATION,
    );
    expect([...errors, ...warnings].join("\n")).toContain("d-inconnu");
  });

  it("signale un impact sur une règle inconnue", () => {
    const { errors } = service.checkScoping(
      input({
        impacts: [
          { target: "RG-absente", kind: "regle", operation: "modifie" },
        ],
      }),
      SPECIFICATION,
    );
    expect(errors.join("\n")).toContain("RG-absente");
  });

  it("lit le statut des règles : avertit d'un impact sur une règle abrogée", () => {
    const { warnings } = service.checkScoping(
      input({
        impacts: [
          { target: "RG-abrogee", kind: "regle", operation: "modifie" },
        ],
        statements: new Map([["RG-abrogee", "Texte."]]),
      }),
      SPECIFICATION,
    );
    expect(warnings.join("\n")).toContain("RG-abrogee");
  });
});
