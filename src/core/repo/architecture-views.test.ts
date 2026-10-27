import { inject, resetInjection } from "../injection";
import { beforeEach, describe, expect, it } from "vitest";
import { SpecificationStore } from "./specification.store";
import {
  Scoping,
  ArchitectureDecision,
  ArchitectureDocument,
  Specification,
  ProjectSettings,
  DEFAULT_LINK_TAGS,
} from "../model/model";

const SETTINGS: ProjectSettings = {
  tokenProtection: "proposee",
  linkTags: DEFAULT_LINK_TAGS,
};

function document(
  id: string,
  kind: ArchitectureDocument["kind"],
  components: string[] = [],
): ArchitectureDocument {
  return {
    id,
    kind: kind,
    status: "actif",
    components,
    statement: "",
    createdBy: null,
    modifiedBy: [],
  };
}

function decision(id: string): ArchitectureDecision {
  return {
    id,
    status: "actif",
    statement: "",
    createdBy: null,
    modifiedBy: [],
  };
}

function scoping(id: string, impacts: Scoping["impacts"]): Scoping {
  return {
    id,
    title: `Cadrage ${id}`,
    status: "livree",
    domains: [],
    links: [],
    impacts,
    goal: "",
    journey: "",
    statements: new Map(),
    decisions: [],
    attachments: [],
    freeSections: [],
    provenance: null,
  } as unknown as Scoping;
}

function specification(partial: Partial<Specification>): Specification {
  return {
    project: { name: "test", description: "", codeRepos: [], prefix: null },
    settings: SETTINGS,
    domains: new Map(),
    features: new Map(),
    rules: new Map(),
    decisions: new Map(),
    architecture: new Map(),
    scopings: new Map(),
    anomalies: [],
    ...partial,
  };
}

/**
 * The cross views of the architecture.
 *
 * What sets these documents apart from a wiki is not that they are versioned,
 * but that the relations between them are computed. A "flows touching this
 * component" list kept by hand would be wrong at the first added flow, and
 * its inaccuracy would never show.
 */
describe("cross views of the architecture", () => {
  let store: SpecificationStore;

  beforeEach(() => {
    resetInjection();

    store = inject(SpecificationStore);
  });

  it("lists the flows that touch a component", () => {
    store.specification.set(
      specification({
        architecture: new Map([
          ["CMP-api", document("CMP-api", "composant")],
          [
            "FLX-export",
            document("FLX-export", "flux", ["CMP-api", "CMP-stockage"]),
          ],
          ["FLX-auth", document("FLX-auth", "flux", ["CMP-api"])],
          ["FLX-ailleurs", document("FLX-ailleurs", "flux", ["CMP-autre"])],
        ]),
      }),
    );

    // Order of the store's documents: by identifier, like rules.
    const flows = store.listFlowsByComponent("CMP-api");
    expect(flows.map((f) => f.id)).toEqual(["FLX-auth", "FLX-export"]);
  });

  it("only keeps as flows the documents of that kind", () => {
    store.specification.set(
      specification({
        architecture: new Map([
          ["CMP-api", document("CMP-api", "composant")],
          // A context can cite components too: it cites them all,
          // and bringing it up among the flows would drown the view being consulted.
          ["CTX-global", document("CTX-global", "contexte", ["CMP-api"])],
          ["FLX-export", document("FLX-export", "flux", ["CMP-api"])],
        ]),
      }),
    );

    expect(store.listFlowsByComponent("CMP-api").map((f) => f.id)).toEqual([
      "FLX-export",
    ]);
  });

  it("lists the documents by kind", () => {
    store.specification.set(
      specification({
        architecture: new Map([
          ["CMP-api", document("CMP-api", "composant")],
          ["FLX-export", document("FLX-export", "flux", ["CMP-api"])],
          ["CTX-global", document("CTX-global", "contexte")],
        ]),
      }),
    );

    expect(store.listArchitectureByKind("composant").map((d) => d.id)).toEqual([
      "CMP-api",
    ]);
    expect(store.listArchitectureByKind("flux").map((d) => d.id)).toEqual([
      "FLX-export",
    ]);
    expect(store.listArchitectureByKind("contexte").map((d) => d.id)).toEqual([
      "CTX-global",
    ]);
  });

  it("goes back from an architecture target to the scopings that produced it", () => {
    store.specification.set(
      specification({
        decisions: new Map([["ADR-stockage", decision("ADR-stockage")]]),
        scopings: new Map([
          [
            "2026-001",
            scoping("2026-001", [
              {
                target: "ADR-stockage",
                kind: "adr",
                operation: "cree",
                rule: "",
              },
            ]),
          ],
          [
            "2026-002",
            scoping("2026-002", [
              {
                target: "ADR-stockage",
                kind: "adr",
                operation: "modifie",
                rule: "",
              },
              {
                target: "RG-autre",
                kind: "regle",
                operation: "cree",
                rule: "RG-autre",
              },
            ]),
          ],
          [
            "2026-003",
            scoping("2026-003", [
              {
                target: "RG-sans-rapport",
                kind: "regle",
                operation: "cree",
                rule: "RG-sans-rapport",
              },
            ]),
          ],
        ]),
      }),
    );

    // Order of the store's scopings: lifecycle, then descending identifier
    // — the most recent first, which also holds for this lookup.
    const scopings = store.listScopingsImpactingTarget("ADR-stockage");
    expect(scopings.map((c) => c.scoping.id)).toEqual(["2026-002", "2026-001"]);
    expect(scopings.map((c) => c.operation)).toEqual(["modifie", "cree"]);
  });

  it("renders the statement of an impact targeting an architecture target", () => {
    // The defect this case guards against: resolution read `regle`, empty for an
    // architecture impact. The statement existed in the scoping and was
    // displayed nowhere — the worst case, since nothing flags a section
    // one does not see.
    const c = scoping("2026-001", [
      {
        target: "FLX-export",
        kind: "architecture",
        operation: "cree",
        rule: "",
      },
      { target: "RG-a", kind: "regle", operation: "cree", rule: "RG-a" },
    ]);
    (c as unknown as { statements: Map<string, string> }).statements = new Map([
      ["FLX-export", "Un export nocturne."],
      ["RG-a", "Une règle."],
    ]);

    store.specification.set(
      specification({
        architecture: new Map([["FLX-export", document("FLX-export", "flux")]]),
        scopings: new Map([["2026-001", c]]),
      }),
    );

    const lines = store.listTargetsByScoping(c);
    expect(lines.map((l) => l.statement)).toEqual([
      "Un export nocturne.",
      "Une règle.",
    ]);
    // The resolved target comes with the statement: without it, the page could not
    // flag that a statement diverges from what the target holds today.
    expect(lines[0].target?.id).toBe("FLX-export");
  });

  it("does not confuse a rule and an architecture target with the same identifier", () => {
    store.specification.set(
      specification({
        scopings: new Map([
          [
            "2026-001",
            scoping("2026-001", [
              // Nothing forbids an identifier from showing up on both sides:
              // the kind is what separates them, not the name.
              { target: "X", kind: "regle", operation: "cree", rule: "X" },
              { target: "X", kind: "adr", operation: "modifie", rule: "" },
            ]),
          ],
        ]),
      }),
    );

    expect(
      store.listScopingsImpactingTarget("X", "adr").map((c) => c.operation),
    ).toEqual(["modifie"]);
    expect(
      store.listScopingsImpactingTarget("X", "regle").map((c) => c.operation),
    ).toEqual(["cree"]);
  });
});
