import { beforeEach, describe, expect, it } from "vitest";
import { inject, resetInjection } from "../injection";
import type { Rule, Specification } from "../model/model";
import { VerificationService, type ScopingInput } from "./verification.service";

/**
 * Verification during authoring, through `checkRepo` from `@ssk-it/canon-check`. The verifier reads entities under the format's names (`domaines`, `statut`, `enonces`, `regle`…), the model names them in English: these cases test the mapping, which no compilation reveals.
 */
describe("verifying a scoping being authored", () => {
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

  it("finds no fault with a scoping consistent with the specification", () => {
    expect(service.checkScoping(input(), SPECIFICATION).errors).toEqual([]);
  });

  it("finds each impact's target under its kind", () => {
    const { errors } = service.checkScoping(input(), SPECIFICATION);
    expect(errors.join("\n")).not.toContain("impact sans cible");
  });

  it("reports a domain the specification does not know", () => {
    const { errors, warnings } = service.checkScoping(
      input({ domains: ["d-inconnu"] }),
      SPECIFICATION,
    );
    expect([...errors, ...warnings].join("\n")).toContain("d-inconnu");
  });

  it("reports an impact on an unknown rule", () => {
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

  it("reads rule statuses: warns of an impact on a repealed rule", () => {
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
