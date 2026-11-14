import { beforeEach, describe, expect, it } from "vitest";
import { LocaleService } from "../i18n/locale.service";
import { inject, resetInjection } from "../injection";
import type { Rule, Specification } from "../model/model";
import mermaid from "mermaid";
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
      applies: [],
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

  // RG-verification-a-la-saisie: the same anomalies as the final check, by their code, said in the interface's language by the library.
  it("says the anomalies in French, word for word as the pull request's check", () => {
    const { errors } = service.checkScoping(
      input({
        impacts: [
          { target: "RG-absente", kind: "regle", operation: "modifie" },
        ],
      }),
      SPECIFICATION,
    );
    expect(errors).toContain("cadrage 2026-070 → règle inconnue : RG-absente");
  });

  it("says them in English when the interface is in English", () => {
    inject(LocaleService).choice.set("en");
    const { errors, warnings } = service.checkScoping(
      input({
        domains: ["d-inconnu"],
        impacts: [
          { target: "RG-absente", kind: "regle", operation: "modifie" },
          { target: "RG-abrogee", kind: "regle", operation: "modifie" },
        ],
        statements: new Map([
          ["RG-absente", "Texte."],
          ["RG-abrogee", "Texte."],
        ]),
      }),
      SPECIFICATION,
    );
    expect(errors).toContain("scoping 2026-070 → unknown domain: d-inconnu");
    expect(errors).toContain("scoping 2026-070 → unknown rule: RG-absente");
    expect(warnings).toContain(
      "scoping 2026-070: operates on RG-abrogee, which is repealed",
    );
    expect([...errors, ...warnings].join("\n")).not.toMatch(/cadrage|inconnue/);
  });

  it("keeps the coded anomalies, to be said again in another language", () => {
    const { anomalies } = service.checkScoping(
      input({
        impacts: [
          { target: "RG-absente", kind: "regle", operation: "modifie" },
        ],
      }),
      SPECIFICATION,
    );
    expect(anomalies.map((a) => a.code)).toContain("cible-inconnue");
  });

  /*
   * Diagrams, scoping 2026-074 of ssk-it/ssk-canon: what the check will refuse is reported while the author writes. An HTML entity needs no renderer and comes with `checkScoping`; the syntax needs Mermaid, the engine that draws, which the view gives to `checkDiagrams`.
   */
  const parse = (text: string) => mermaid.parse(text);
  const diagram = (text: string) => "Texte.\n\n```mermaid\n" + text + "\n```";

  it("reports an HTML entity in a diagram of a statement", () => {
    const { anomalies } = service.checkScoping(
      input({
        statements: new Map([
          [
            "RG-active",
            diagram('flowchart LR\n    A["br-&lt;branche&gt;"] --> B'),
          ],
        ]),
      }),
      SPECIFICATION,
    );
    expect(anomalies.map((a) => a.code)).toContain("diagramme-entite-html");
  });

  it("reports a diagram Mermaid cannot read", async () => {
    const { errors, anomalies } = await service.checkDiagrams(
      input({
        statements: new Map([
          ["RG-active", diagram("flowchart LR\n    A -- B")],
        ]),
      }),
      parse,
      SPECIFICATION,
    );
    expect(anomalies.map((a) => a.code)).toEqual(["diagramme-illisible"]);
    expect(errors.join("\n")).toContain("2026-070 → RG-active");
  });

  it("finds nothing to say about a readable diagram", async () => {
    const verdict = await service.checkDiagrams(
      input({
        statements: new Map([
          ["RG-active", diagram("flowchart LR\n    A --> B")],
        ]),
      }),
      parse,
      SPECIFICATION,
    );
    expect(verdict.anomalies).toEqual([]);
  });

  it("does not call the parser for a scoping without diagrams", async () => {
    const never = () => Promise.reject(new Error("appelé"));
    const verdict = await service.checkDiagrams(input(), never, SPECIFICATION);
    expect(verdict).toEqual({ errors: [], warnings: [], anomalies: [] });
  });
});
