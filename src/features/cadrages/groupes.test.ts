import { describe, expect, it } from "vitest";
import type { Cadrage, StatutCadrage } from "../../core/model/model";
import {
  etatDatesLivres,
  filtrerCadrages,
  grouperCadrages,
  trimestreDe,
} from "./groupes";

function cadrage(
  id: string,
  statut: StatutCadrage,
  titre = id,
  domaines: string[] = [],
): Cadrage {
  return {
    id,
    titre,
    statut,
    domaines,
    liens: [],
    impacts: [],
    objectif: "",
    parcours: "",
    enonces: new Map(),
    decisions: [],
    piecesJointes: [],
    divers: [],
  };
}

/** Les dates d'un jeu d'essai, par identifiant. */
function dates(m: Record<string, string | null | undefined>) {
  return (id: string) => m[id];
}

describe("trimestre d’une date", () => {
  it("range janvier à mars dans le premier", () => {
    expect(trimestreDe("2026-01-01T00:00:00Z")).toBe("2026-T1");
    expect(trimestreDe("2026-03-31T23:00:00Z")).toBe("2026-T1");
  });

  it("range octobre à décembre dans le quatrième", () => {
    expect(trimestreDe("2026-10-01T00:00:00Z")).toBe("2026-T4");
    expect(trimestreDe("2026-12-31T00:00:00Z")).toBe("2026-T4");
  });
});

describe("groupes de la liste des cadrages", () => {
  it("sort le travail en cours des trimestres", () => {
    const groupes = grouperCadrages(
      [cadrage("2026-005", "brouillon"), cadrage("2026-004", "livree")],
      dates({ "2026-004": "2026-09-01T10:00:00Z" }),
    );
    expect(groupes.map((g) => g.cle)).toEqual(["en-cours", "2026-T3"]);
    expect(groupes[0].cadrages.map((c) => c.id)).toEqual(["2026-005"]);
  });

  it("réunit sous un même trimestre les cadrages livrés du même trimestre", () => {
    const groupes = grouperCadrages(
      [cadrage("a", "livree"), cadrage("b", "livree"), cadrage("c", "livree")],
      dates({
        a: "2026-09-01T10:00:00Z",
        b: "2026-07-15T10:00:00Z",
        c: "2026-04-02T10:00:00Z",
      }),
    );
    expect(groupes.map((g) => g.cle)).toEqual(["2026-T3", "2026-T2"]);
    expect(groupes[0].cadrages.map((c) => c.id)).toEqual(["a", "b"]);
  });

  // Les dates arrivent après la liste : un cadrage sans date encore connue doit
  // rester visible plutôt que d'être escamoté le temps du chargement.
  it("garde en fin de liste un cadrage dont la date manque", () => {
    const groupes = grouperCadrages(
      [cadrage("a", "livree"), cadrage("b", "livree")],
      dates({ a: "2026-09-01T10:00:00Z" }),
    );
    expect(groupes.map((g) => g.cle)).toEqual(["2026-T3", "sans-date"]);
    expect(groupes[1].cadrages.map((c) => c.id)).toEqual(["b"]);
  });

  it("n’ouvre pas de groupe « en cours » quand tout est livré", () => {
    const groupes = grouperCadrages(
      [cadrage("a", "livree")],
      dates({ a: "2026-09-01T10:00:00Z" }),
    );
    expect(groupes.map((g) => g.cle)).toEqual(["2026-T3"]);
  });

  // Le premier trimestre est le seul dont l'ordinal ne suit pas la règle.
  it("libelle le trimestre en clair, « 1ᵉʳ » compris", () => {
    const groupes = grouperCadrages(
      [cadrage("a", "livree")],
      dates({ a: "2026-02-01T10:00:00Z" }),
    );
    expect(groupes[0].libelle).toBe("1ᵉʳ trimestre 2026");
  });
});

describe("livrés sans aucune date", () => {
  // Sans date lue, un en-tête « Pas encore daté » sur toute la liste laissait
  // croire à une catégorie de cadrages — RG-liste-cadrages-sobre.
  it("les réunit sous « Livrés » quand aucun n’est daté", () => {
    const groupes = grouperCadrages(
      [
        cadrage("b", "brouillon"),
        cadrage("a", "livree"),
        cadrage("c", "livree"),
      ],
      dates({ a: null, c: undefined }),
    );
    expect(groupes.map((g) => g.cle)).toEqual(["en-cours", "livres"]);
    expect(groupes[1].libelle).toBe("Livrés");
    expect(groupes[1].cadrages.map((c) => c.id)).toEqual(["a", "c"]);
  });

  it("dit que les dates arrivent tant qu’il en reste à lire", () => {
    expect(
      etatDatesLivres([cadrage("a", "livree")], dates({ a: undefined })),
    ).toBe("chargement");
  });

  it("dit qu’elles sont indisponibles quand toutes les lectures ont échoué", () => {
    expect(
      etatDatesLivres(
        [cadrage("a", "livree"), cadrage("b", "livree")],
        dates({ a: null, b: null }),
      ),
    ).toBe("indisponibles");
  });

  it("ne signale rien dès qu’une date est connue", () => {
    expect(
      etatDatesLivres(
        [cadrage("a", "livree"), cadrage("b", "livree")],
        dates({ a: "2026-09-01T10:00:00Z", b: null }),
      ),
    ).toBe("lues");
    // un cadrage en cours n'a pas de date de livraison à attendre
    expect(etatDatesLivres([cadrage("a", "brouillon")], dates({}))).toBe(
      "lues",
    );
  });
});

describe("filtre de la liste des cadrages", () => {
  const liste = [
    cadrage("2026-005", "brouillon", "Alléger la barre", ["referentiel"]),
    cadrage("2026-004", "livree", "Rendre les diagrammes", [
      "referentiel",
      "cadrage",
    ]),
    cadrage("2026-003", "livree", "Chiffrer les pièces jointes", [
      "persistance",
    ]),
  ];
  const ids = (l: readonly Cadrage[]) => l.map((c) => c.id);

  it("ne retire rien sans critère", () => {
    expect(ids(filtrerCadrages(liste, "", new Set(), null))).toEqual([
      "2026-005",
      "2026-004",
      "2026-003",
    ]);
  });

  it("cherche dans le titre, sans tenir compte de la casse ni des accents", () => {
    expect(ids(filtrerCadrages(liste, "PIECES", new Set(), null))).toEqual([
      "2026-003",
    ]);
    expect(ids(filtrerCadrages(liste, "allEger", new Set(), null))).toEqual([
      "2026-005",
    ]);
  });

  it("cherche dans l’identifiant, préfixé ou non", () => {
    expect(ids(filtrerCadrages(liste, "004", new Set(), null))).toEqual([
      "2026-004",
    ]);
    expect(ids(filtrerCadrages(liste, "SC-2026-003", new Set(), "SC"))).toEqual(
      ["2026-003"],
    );
  });

  it("retient les cadrages d’un des domaines choisis, dans le même ordre", () => {
    expect(
      ids(filtrerCadrages(liste, "", new Set(["referentiel"]), null)),
    ).toEqual(["2026-005", "2026-004"]);
    expect(
      ids(
        filtrerCadrages(liste, "", new Set(["cadrage", "persistance"]), null),
      ),
    ).toEqual(["2026-004", "2026-003"]);
  });

  it("cumule le texte et les domaines", () => {
    expect(
      ids(filtrerCadrages(liste, "barre", new Set(["persistance"]), null)),
    ).toEqual([]);
  });
});
