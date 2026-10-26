import { describe, expect, it } from "vitest";
import { serializeScoping } from "./authoring.service";
import type { EditableScoping } from "./authoring.service";

/**
 * What a scoping writes when it targets an architecture target.
 *
 * The field used — `regle`, `adr` or `architecture` — is what tells the
 * checker and the propagation which directory to write to. Always writing it
 * as `regle` would produce a file accepted on input, rejected on delivery,
 * and the author would only learn it once their pull request was open.
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

describe("writing an impact towards an architecture target", () => {
  it("writes the field matching the targeted kind", () => {
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

  it("titles the statements by the targeted identifier, whatever the kind", () => {
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

    // Propagation finds the statement by the target's identifier: a title
    // carrying anything else would leave it with nothing to write.
    expect(text).toContain("### ADR-b");
    expect(text).toContain("Une décision.");
  });

  it("writes « regle » for an impact whose kind is not set", () => {
    // Scopings written before this change have no kind. Writing them
    // without a target field would produce an impact that nothing can resolve.
    const text = serializeScoping(
      "2026-001",
      scoping({
        impacts: [{ target: "RG-ancien", operation: "touche", statement: "" }],
      } as Partial<EditableScoping>),
    );

    expect(text).toContain("- { regle: RG-ancien, operation: touche }");
  });
});
