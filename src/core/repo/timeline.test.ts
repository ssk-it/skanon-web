import { describe, expect, it } from "vitest";
import { matchTimeline, TimelineCommit } from "./timeline.service";

/**
 * Scoping ↔ commit matching is the only logic of this service that is not a
 * network call, and it is the one that decides what the reader sees.
 *
 * The case that matters is the specification written after the fact: several
 * scopings describe decisions predating the repo, and no commit matches
 * them. Hiding them would claim the decision did not happen.
 */
function commit(title: string, oid = "abc1234"): TimelineCommit {
  return {
    oid,
    date: "2026-08-31T12:00:00Z",
    author: "Sébastien Skorupski",
    login: "sskorupski",
    title,
    pullRequest: null,
    content: null,
  };
}

describe("matching a timeline", () => {
  it("attaches a scoping to the commit whose message cites it", () => {
    const entries = matchTimeline(
      ["2026-011"],
      [commit("Cadrage 2026-011 : distribution de l’automatisation")],
    );

    expect(entries.length).toBe(1);
    expect(entries[0].commit?.login).toBe("sskorupski");
  });

  it("keeps a scoping without a commit, without its Git data", () => {
    const entries = matchTimeline(
      ["2026-001", "2026-011"],
      [commit("Cadrage 2026-011 : x")],
    );

    expect(entries.map((e) => e.scoping)).toEqual(["2026-001", "2026-011"]);
    // the scoping predating the repo stays visible, simply without a date
    expect(entries[0].commit).toBeNull();
    expect(entries[1].commit).not.toBeNull();
  });

  it("never assigns the same commit twice", () => {
    // a message citing two scopings would date both from the same commit,
    // which would display a wrong date on one of them
    const entries = matchTimeline(
      ["2026-001", "2026-002"],
      [commit("Cadrages 2026-001 et 2026-002 : socle", "aaa")],
    );

    expect(entries[0].commit?.oid).toBe("aaa");
    expect(entries[1].commit).toBeNull();
  });

  it("ignores commits that cite no scoping", () => {
    const entries = matchTimeline(
      ["2026-011"],
      [commit("Corrige une coquille")],
    );

    expect(entries[0].commit).toBeNull();
  });

  it("returns one entry per scoping even without any commit", () => {
    const entries = matchTimeline(["2026-001", "2026-002"], []);

    expect(entries.length).toBe(2);
    expect(entries.every((e) => e.commit === null)).toBe(true);
  });
});
