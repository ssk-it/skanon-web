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
  access: "jeton_personnel",
  identity: null,
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
 * Les vues croisées de l'architecture.
 *
 * Ce qui distingue ces documents d'un wiki n'est pas qu'ils soient versionnés,
 * mais que les relations entre eux se calculent. Une liste « flux touchant ce
 * composant » tenue à la main serait fausse au premier flux ajouté, et son
 * inexactitude ne se verrait jamais.
 */
describe("vues croisées de l’architecture", () => {
  let store: SpecificationStore;

  beforeEach(() => {
    resetInjection();

    store = inject(SpecificationStore);
  });

  it("liste les flux qui touchent un composant", () => {
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

    // Ordre des documents du store : par identifiant, comme les règles.
    const flows = store.listFlowsByComponent("CMP-api");
    expect(flows.map((f) => f.id)).toEqual(["FLX-auth", "FLX-export"]);
  });

  it("ne retient comme flux que les documents de cette nature", () => {
    store.specification.set(
      specification({
        architecture: new Map([
          ["CMP-api", document("CMP-api", "composant")],
          // Un contexte peut lui aussi citer des composants : il les cite tous,
          // et le faire remonter parmi les flux noierait la vue qu'on consulte.
          ["CTX-global", document("CTX-global", "contexte", ["CMP-api"])],
          ["FLX-export", document("FLX-export", "flux", ["CMP-api"])],
        ]),
      }),
    );

    expect(store.listFlowsByComponent("CMP-api").map((f) => f.id)).toEqual([
      "FLX-export",
    ]);
  });

  it("liste les documents par nature", () => {
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

  it("remonte d’une cible d’architecture aux cadrages qui l’ont produite", () => {
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

    // Ordre des cadrages du store : cycle de vie, puis identifiant décroissant
    // — le plus récent d'abord, ce qui vaut aussi pour cette remontée.
    const scopings = store.listScopingsImpactingTarget("ADR-stockage");
    expect(scopings.map((c) => c.scoping.id)).toEqual(["2026-002", "2026-001"]);
    expect(scopings.map((c) => c.operation)).toEqual(["modifie", "cree"]);
  });

  it("rend l’énoncé d’un impact visant une cible d’architecture", () => {
    // Le défaut que ce cas protège : la résolution lisait `regle`, vide pour un
    // impact d'architecture. L'énoncé existait dans le cadrage et n'était
    // affiché nulle part — le pire des cas, puisque rien ne signale une section
    // qu'on ne voit pas.
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
    // La cible résolue accompagne l'énoncé : sans elle, la fiche ne pourrait pas
    // signaler qu'un énoncé diverge de ce que la cible porte aujourd'hui.
    expect(lines[0].target?.id).toBe("FLX-export");
  });

  it("ne confond pas une règle et une cible d’architecture de même identifiant", () => {
    store.specification.set(
      specification({
        scopings: new Map([
          [
            "2026-001",
            scoping("2026-001", [
              // Rien n'interdit qu'un identifiant se retrouve des deux côtés :
              // la nature est ce qui les sépare, pas le nom.
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
