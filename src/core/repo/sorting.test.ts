import { describe, expect, it } from "vitest";
import { LIFECYCLE_ORDER, HISTORY_ORDER, ScopingStatus } from "../model/model";

/**
 * Two orders coexist, and it is not an inconsistency.
 *
 * The list of scopings follows the lifecycle — drafts first — because one
 * looks there for what needs attention. A rule's timeline follows the reverse
 * order, because one goes back from the current state.
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

describe("order of the scoping list", () => {
  it("puts drafts first and delivered ones last", () => {
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

  it("puts the most recent first at equal status", () => {
    const order = sort(
      [
        { id: "2026-008", status: "livree" },
        { id: "2026-002", status: "livree" },
        { id: "2026-010", status: "livree" },
      ],
      LIFECYCLE_ORDER,
      false,
    );
    // the three-digit sequence makes the textual comparison correct
    expect(order).toEqual(["2026-010", "2026-008", "2026-002"]);
  });

  it("respects the passage from one year to the next", () => {
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

describe("order of a rule's timeline", () => {
  it("puts delivered ones first, from most recent to oldest", () => {
    const order = sort(
      [
        { id: "2026-002", status: "livree" },
        { id: "2026-009", status: "brouillon" },
        { id: "2026-006", status: "livree" },
      ],
      HISTORY_ORDER,
      false,
    );
    // we start from the current state and go back to the rule's origin
    expect(order).toEqual(["2026-006", "2026-002", "2026-009"]);
  });

  it("is indeed the reverse of the lifecycle on statuses", () => {
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
