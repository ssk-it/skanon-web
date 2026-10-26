import { describe, expect, it } from "vitest";
import type { Scoping, ScopingStatus } from "../../core/model/model";
import {
  deliveredDatesState,
  filterScopings,
  groupScopings,
  quarterOf,
} from "./groups";

function scoping(
  id: string,
  status: ScopingStatus,
  title = id,
  domains: string[] = [],
): Scoping {
  return {
    id,
    title,
    status: status,
    domains,
    links: [],
    impacts: [],
    goal: "",
    journey: "",
    statements: new Map(),
    decisions: [],
    attachments: [],
    misc: [],
  };
}

/** The dates of a test fixture, by identifier. */
function dates(m: Record<string, string | null | undefined>) {
  return (id: string) => m[id];
}

describe("quarter of a date", () => {
  it("puts January to March in the first", () => {
    expect(quarterOf("2026-01-01T00:00:00Z")).toBe("2026-T1");
    expect(quarterOf("2026-03-31T23:00:00Z")).toBe("2026-T1");
  });

  it("puts October to December in the fourth", () => {
    expect(quarterOf("2026-10-01T00:00:00Z")).toBe("2026-T4");
    expect(quarterOf("2026-12-31T00:00:00Z")).toBe("2026-T4");
  });
});

describe("groups of the scopings list", () => {
  it("takes work in progress out of the quarters", () => {
    const groups = groupScopings(
      [scoping("2026-005", "brouillon"), scoping("2026-004", "livree")],
      dates({ "2026-004": "2026-09-01T10:00:00Z" }),
    );
    expect(groups.map((g) => g.key)).toEqual(["en-cours", "2026-T3"]);
    expect(groups[0].scopings.map((c) => c.id)).toEqual(["2026-005"]);
  });

  it("gathers delivered scopings of the same quarter under one quarter", () => {
    const groups = groupScopings(
      [scoping("a", "livree"), scoping("b", "livree"), scoping("c", "livree")],
      dates({
        a: "2026-09-01T10:00:00Z",
        b: "2026-07-15T10:00:00Z",
        c: "2026-04-02T10:00:00Z",
      }),
    );
    expect(groups.map((g) => g.key)).toEqual(["2026-T3", "2026-T2"]);
    expect(groups[0].scopings.map((c) => c.id)).toEqual(["a", "b"]);
  });

  // Dates arrive after the list: a scoping with no known date yet must
  // stay visible rather than be hidden while loading.
  it("keeps a scoping whose date is missing at the end of the list", () => {
    const groups = groupScopings(
      [scoping("a", "livree"), scoping("b", "livree")],
      dates({ a: "2026-09-01T10:00:00Z" }),
    );
    expect(groups.map((g) => g.key)).toEqual(["2026-T3", "sans-date"]);
    expect(groups[1].scopings.map((c) => c.id)).toEqual(["b"]);
  });

  it("does not open an « en cours » group when everything is delivered", () => {
    const groups = groupScopings(
      [scoping("a", "livree")],
      dates({ a: "2026-09-01T10:00:00Z" }),
    );
    expect(groups.map((g) => g.key)).toEqual(["2026-T3"]);
  });

  // The first quarter is the only one whose ordinal does not follow the rule.
  it("labels the quarter in plain words, « 1ᵉʳ » included", () => {
    const groups = groupScopings(
      [scoping("a", "livree")],
      dates({ a: "2026-02-01T10:00:00Z" }),
    );
    expect(groups[0].label).toBe("1ᵉʳ trimestre 2026");
  });
});

describe("delivered without any date", () => {
  // With no date read, a « Pas encore daté » header over the whole list suggested
  // a category of scopings — RG-liste-cadrages-sobre.
  it("gathers them under « Livrés » when none is dated", () => {
    const groups = groupScopings(
      [
        scoping("b", "brouillon"),
        scoping("a", "livree"),
        scoping("c", "livree"),
      ],
      dates({ a: null, c: undefined }),
    );
    expect(groups.map((g) => g.key)).toEqual(["en-cours", "livres"]);
    expect(groups[1].label).toBe("Livrés");
    expect(groups[1].scopings.map((c) => c.id)).toEqual(["a", "c"]);
  });

  it("says the dates are coming while some remain to be read", () => {
    expect(
      deliveredDatesState([scoping("a", "livree")], dates({ a: undefined })),
    ).toBe("chargement");
  });

  it("says they are unavailable when all reads failed", () => {
    expect(
      deliveredDatesState(
        [scoping("a", "livree"), scoping("b", "livree")],
        dates({ a: null, b: null }),
      ),
    ).toBe("indisponibles");
  });

  it("flags nothing as soon as one date is known", () => {
    expect(
      deliveredDatesState(
        [scoping("a", "livree"), scoping("b", "livree")],
        dates({ a: "2026-09-01T10:00:00Z", b: null }),
      ),
    ).toBe("lues");
    // a scoping in progress has no delivery date to wait for
    expect(deliveredDatesState([scoping("a", "brouillon")], dates({}))).toBe(
      "lues",
    );
  });
});

describe("filter of the scopings list", () => {
  const list = [
    scoping("2026-005", "brouillon", "Alléger la barre", ["referentiel"]),
    scoping("2026-004", "livree", "Rendre les diagrammes", [
      "referentiel",
      "cadrage",
    ]),
    scoping("2026-003", "livree", "Chiffrer les pièces jointes", [
      "persistance",
    ]),
  ];
  const ids = (l: readonly Scoping[]) => l.map((c) => c.id);

  it("removes nothing without a criterion", () => {
    expect(ids(filterScopings(list, "", new Set(), null))).toEqual([
      "2026-005",
      "2026-004",
      "2026-003",
    ]);
  });

  it("searches the title, ignoring case and accents", () => {
    expect(ids(filterScopings(list, "PIECES", new Set(), null))).toEqual([
      "2026-003",
    ]);
    expect(ids(filterScopings(list, "allEger", new Set(), null))).toEqual([
      "2026-005",
    ]);
  });

  it("searches the identifier, prefixed or not", () => {
    expect(ids(filterScopings(list, "004", new Set(), null))).toEqual([
      "2026-004",
    ]);
    expect(ids(filterScopings(list, "SC-2026-003", new Set(), "SC"))).toEqual([
      "2026-003",
    ]);
  });

  it("keeps the scopings of one of the chosen domains, in the same order", () => {
    expect(
      ids(filterScopings(list, "", new Set(["referentiel"]), null)),
    ).toEqual(["2026-005", "2026-004"]);
    expect(
      ids(filterScopings(list, "", new Set(["cadrage", "persistance"]), null)),
    ).toEqual(["2026-004", "2026-003"]);
  });

  it("combines text and domains", () => {
    expect(
      ids(filterScopings(list, "barre", new Set(["persistance"]), null)),
    ).toEqual([]);
  });
});
