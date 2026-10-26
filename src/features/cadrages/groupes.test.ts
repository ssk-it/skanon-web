import { describe, expect, it } from "vitest";
import type { Scoping, ScopingStatus } from "../../core/model/model";
import {
  deliveredDatesState,
  filterScopings,
  groupScopings,
  quarterOf,
} from "./groupes";

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

/** Les dates d'un jeu d'essai, par identifiant. */
function dates(m: Record<string, string | null | undefined>) {
  return (id: string) => m[id];
}

describe("trimestre d’une date", () => {
  it("range janvier à mars dans le premier", () => {
    expect(quarterOf("2026-01-01T00:00:00Z")).toBe("2026-T1");
    expect(quarterOf("2026-03-31T23:00:00Z")).toBe("2026-T1");
  });

  it("range octobre à décembre dans le quatrième", () => {
    expect(quarterOf("2026-10-01T00:00:00Z")).toBe("2026-T4");
    expect(quarterOf("2026-12-31T00:00:00Z")).toBe("2026-T4");
  });
});

describe("groupes de la liste des cadrages", () => {
  it("sort le travail en cours des trimestres", () => {
    const groups = groupScopings(
      [scoping("2026-005", "brouillon"), scoping("2026-004", "livree")],
      dates({ "2026-004": "2026-09-01T10:00:00Z" }),
    );
    expect(groups.map((g) => g.key)).toEqual(["en-cours", "2026-T3"]);
    expect(groups[0].scopings.map((c) => c.id)).toEqual(["2026-005"]);
  });

  it("réunit sous un même trimestre les cadrages livrés du même trimestre", () => {
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

  // Les dates arrivent après la liste : un cadrage sans date encore connue doit
  // rester visible plutôt que d'être escamoté le temps du chargement.
  it("garde en fin de liste un cadrage dont la date manque", () => {
    const groups = groupScopings(
      [scoping("a", "livree"), scoping("b", "livree")],
      dates({ a: "2026-09-01T10:00:00Z" }),
    );
    expect(groups.map((g) => g.key)).toEqual(["2026-T3", "sans-date"]);
    expect(groups[1].scopings.map((c) => c.id)).toEqual(["b"]);
  });

  it("n’ouvre pas de groupe « en cours » quand tout est livré", () => {
    const groups = groupScopings(
      [scoping("a", "livree")],
      dates({ a: "2026-09-01T10:00:00Z" }),
    );
    expect(groups.map((g) => g.key)).toEqual(["2026-T3"]);
  });

  // Le premier trimestre est le seul dont l'ordinal ne suit pas la règle.
  it("libelle le trimestre en clair, « 1ᵉʳ » compris", () => {
    const groups = groupScopings(
      [scoping("a", "livree")],
      dates({ a: "2026-02-01T10:00:00Z" }),
    );
    expect(groups[0].label).toBe("1ᵉʳ trimestre 2026");
  });
});

describe("livrés sans aucune date", () => {
  // Sans date lue, un en-tête « Pas encore daté » sur toute la liste laissait
  // croire à une catégorie de cadrages — RG-liste-cadrages-sobre.
  it("les réunit sous « Livrés » quand aucun n’est daté", () => {
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

  it("dit que les dates arrivent tant qu’il en reste à lire", () => {
    expect(
      deliveredDatesState([scoping("a", "livree")], dates({ a: undefined })),
    ).toBe("chargement");
  });

  it("dit qu’elles sont indisponibles quand toutes les lectures ont échoué", () => {
    expect(
      deliveredDatesState(
        [scoping("a", "livree"), scoping("b", "livree")],
        dates({ a: null, b: null }),
      ),
    ).toBe("indisponibles");
  });

  it("ne signale rien dès qu’une date est connue", () => {
    expect(
      deliveredDatesState(
        [scoping("a", "livree"), scoping("b", "livree")],
        dates({ a: "2026-09-01T10:00:00Z", b: null }),
      ),
    ).toBe("lues");
    // un cadrage en cours n'a pas de date de livraison à attendre
    expect(deliveredDatesState([scoping("a", "brouillon")], dates({}))).toBe(
      "lues",
    );
  });
});

describe("filtre de la liste des cadrages", () => {
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

  it("ne retire rien sans critère", () => {
    expect(ids(filterScopings(list, "", new Set(), null))).toEqual([
      "2026-005",
      "2026-004",
      "2026-003",
    ]);
  });

  it("cherche dans le titre, sans tenir compte de la casse ni des accents", () => {
    expect(ids(filterScopings(list, "PIECES", new Set(), null))).toEqual([
      "2026-003",
    ]);
    expect(ids(filterScopings(list, "allEger", new Set(), null))).toEqual([
      "2026-005",
    ]);
  });

  it("cherche dans l’identifiant, préfixé ou non", () => {
    expect(ids(filterScopings(list, "004", new Set(), null))).toEqual([
      "2026-004",
    ]);
    expect(ids(filterScopings(list, "SC-2026-003", new Set(), "SC"))).toEqual([
      "2026-003",
    ]);
  });

  it("retient les cadrages d’un des domaines choisis, dans le même ordre", () => {
    expect(
      ids(filterScopings(list, "", new Set(["referentiel"]), null)),
    ).toEqual(["2026-005", "2026-004"]);
    expect(
      ids(filterScopings(list, "", new Set(["cadrage", "persistance"]), null)),
    ).toEqual(["2026-004", "2026-003"]);
  });

  it("cumule le texte et les domaines", () => {
    expect(
      ids(filterScopings(list, "barre", new Set(["persistance"]), null)),
    ).toEqual([]);
  });
});
