import { describe, expect, it } from "vitest";
import { LIFECYCLE_ORDER, HISTORY_ORDER, ScopingStatus } from "../model/model";

/**
 * Deux ordres coexistent, et ce n'est pas une incohérence.
 *
 * La liste des cadrages suit le cycle de vie — brouillon d'abord — parce qu'on
 * y cherche ce qui demande de l'attention. La chronologie d'une règle suit
 * l'ordre inverse, parce qu'on y remonte depuis l'état actuel.
 */
function sort(
  entries: Array<{ id: string; status: ScopingStatus }>,
  order: Record<ScopingStatus, number>,
  ascendingId = true,
) {
  return [...entries]
    .sort((a, b) => {
      const byStatus = order[a.status] - order[b.status];
      if (byStatus !== 0) return byStatus;
      return ascendingId ? a.id.localeCompare(b.id) : b.id.localeCompare(a.id);
    })
    .map((e) => e.id);
}

describe("ordre de la liste des cadrages", () => {
  it("place les brouillons devant et les livrés en dernier", () => {
    const order = sort(
      [
        { id: "2026-001", status: "livree" },
        { id: "2026-005", status: "brouillon" },
        { id: "2026-003", status: "validee" },
        { id: "2026-004", status: "en_relecture" },
      ],
      LIFECYCLE_ORDER,
      false,
    );
    expect(order).toEqual(["2026-005", "2026-004", "2026-003", "2026-001"]);
  });

  it("place le plus récent en tête à statut égal", () => {
    const order = sort(
      [
        { id: "2026-008", status: "livree" },
        { id: "2026-002", status: "livree" },
        { id: "2026-010", status: "livree" },
      ],
      LIFECYCLE_ORDER,
      false,
    );
    // la séquence sur trois chiffres rend la comparaison textuelle correcte
    expect(order).toEqual(["2026-010", "2026-008", "2026-002"]);
  });

  it("respecte le passage d’une année à l’autre", () => {
    const order = sort(
      [
        { id: "2026-012", status: "livree" },
        { id: "2027-001", status: "livree" },
      ],
      LIFECYCLE_ORDER,
      false,
    );
    expect(order).toEqual(["2027-001", "2026-012"]);
  });
});

describe("ordre de la chronologie d’une règle", () => {
  it("place les livrés en tête, du plus récent au plus ancien", () => {
    const order = sort(
      [
        { id: "2026-002", status: "livree" },
        { id: "2026-009", status: "brouillon" },
        { id: "2026-006", status: "livree" },
      ],
      HISTORY_ORDER,
      false,
    );
    // on part de l'état actuel pour remonter vers l'origine de la règle
    expect(order).toEqual(["2026-006", "2026-002", "2026-009"]);
  });

  it("est bien l’inverse du cycle de vie sur les statuts", () => {
    const statuses: ScopingStatus[] = [
      "brouillon",
      "en_relecture",
      "validee",
      "livree",
    ];
    const cycle = [...statuses].sort(
      (a, b) => LIFECYCLE_ORDER[a] - LIFECYCLE_ORDER[b],
    );
    const history = [...statuses].sort(
      (a, b) => HISTORY_ORDER[a] - HISTORY_ORDER[b],
    );
    expect(history).toEqual([...cycle].reverse());
  });
});
