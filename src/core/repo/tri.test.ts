import { describe, expect, it } from "vitest";
import {
  ORDRE_CYCLE_VIE,
  ORDRE_HISTORIQUE,
  StatutCadrage,
} from "../model/model";

/**
 * Deux ordres coexistent, et ce n'est pas une incohérence.
 *
 * La liste des cadrages suit le cycle de vie — brouillon d'abord — parce qu'on
 * y cherche ce qui demande de l'attention. La chronologie d'une règle suit
 * l'ordre inverse, parce qu'on y remonte depuis l'état actuel.
 */
function trier(
  entrees: Array<{ id: string; statut: StatutCadrage }>,
  ordre: Record<StatutCadrage, number>,
  idCroissant = true,
) {
  return [...entrees]
    .sort((a, b) => {
      const parStatut = ordre[a.statut] - ordre[b.statut];
      if (parStatut !== 0) return parStatut;
      return idCroissant ? a.id.localeCompare(b.id) : b.id.localeCompare(a.id);
    })
    .map((e) => e.id);
}

describe("ordre de la liste des cadrages", () => {
  it("place les brouillons devant et les livrés en dernier", () => {
    const ordre = trier(
      [
        { id: "2026-001", statut: "livree" },
        { id: "2026-005", statut: "brouillon" },
        { id: "2026-003", statut: "validee" },
        { id: "2026-004", statut: "en_relecture" },
      ],
      ORDRE_CYCLE_VIE,
      false,
    );
    expect(ordre).toEqual(["2026-005", "2026-004", "2026-003", "2026-001"]);
  });

  it("place le plus récent en tête à statut égal", () => {
    const ordre = trier(
      [
        { id: "2026-008", statut: "livree" },
        { id: "2026-002", statut: "livree" },
        { id: "2026-010", statut: "livree" },
      ],
      ORDRE_CYCLE_VIE,
      false,
    );
    // la séquence sur trois chiffres rend la comparaison textuelle correcte
    expect(ordre).toEqual(["2026-010", "2026-008", "2026-002"]);
  });

  it("respecte le passage d’une année à l’autre", () => {
    const ordre = trier(
      [
        { id: "2026-012", statut: "livree" },
        { id: "2027-001", statut: "livree" },
      ],
      ORDRE_CYCLE_VIE,
      false,
    );
    expect(ordre).toEqual(["2027-001", "2026-012"]);
  });
});

describe("ordre de la chronologie d’une règle", () => {
  it("place les livrés en tête, du plus récent au plus ancien", () => {
    const ordre = trier(
      [
        { id: "2026-002", statut: "livree" },
        { id: "2026-009", statut: "brouillon" },
        { id: "2026-006", statut: "livree" },
      ],
      ORDRE_HISTORIQUE,
      false,
    );
    // on part de l'état actuel pour remonter vers l'origine de la règle
    expect(ordre).toEqual(["2026-006", "2026-002", "2026-009"]);
  });

  it("est bien l’inverse du cycle de vie sur les statuts", () => {
    const statuts: StatutCadrage[] = [
      "brouillon",
      "en_relecture",
      "validee",
      "livree",
    ];
    const cycle = [...statuts].sort(
      (a, b) => ORDRE_CYCLE_VIE[a] - ORDRE_CYCLE_VIE[b],
    );
    const histoire = [...statuts].sort(
      (a, b) => ORDRE_HISTORIQUE[a] - ORDRE_HISTORIQUE[b],
    );
    expect(histoire).toEqual([...cycle].reverse());
  });
});
