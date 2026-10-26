import { describe, expect, it } from "vitest";
import {
  compareRules,
  listScopingsDeliveredBetween,
} from "./comparison.service";
import {
  Scoping,
  Specification,
  Rule,
  ScopingStatus,
  DEFAULT_LINK_TAGS,
} from "../model/model";

/**
 * The comparison answers "what did this quarter do?", not "what exists?".
 * An unchanged rule must therefore produce no entry: listing what stayed still
 * would drown what moved, and what moved is what one came looking for.
 */
function rule(
  id: string,
  statement: string,
  status: "actif" | "abroge" = "actif",
): Rule {
  return {
    id,
    features: ["f"],
    status,
    statement,
    createdBy: null,
    modifiedBy: [],
  } as Rule;
}

function scoping(id: string, status: ScopingStatus): Scoping {
  return {
    id,
    status: status,
    impacts: [],
    statements: new Map(),
  } as unknown as Scoping;
}

/**
 * Settings a project gets without declaring anything.
 *
 * Named once: these tests are about the comparison, not about settings,
 * and each field added to `ProjectSettings` broke them one by one.
 */
const MINIMAL_SETTINGS = {
  access: "jeton_personnel",
  identity: null,
  tokenProtection: "proposee",
  linkTags: DEFAULT_LINK_TAGS,
} as const;

function specification(rules: Rule[], scopings: Scoping[] = []): Specification {
  return {
    project: { name: "test", description: "", codeRepos: [], prefix: null },
    settings: MINIMAL_SETTINGS,
    domains: new Map(),
    features: new Map(),
    rules: new Map(rules.map((r) => [r.id, r])),
    decisions: new Map(),
    architecture: new Map(),
    scopings: new Map(scopings.map((c) => [c.id, c])),
    anomalies: [],
  };
}

describe("comparison of two states of the specification", () => {
  it("ignores a rule whose statement has not moved", () => {
    const before = specification([rule("RG-a", "texte")]);
    const after = specification([rule("RG-a", "texte")]);

    expect(compareRules(before, after)).toEqual([]);
  });

  it("does not keep a difference in trailing whitespace", () => {
    // the format adds a final blank line on write: propagation
    // would otherwise produce a modification on each run
    const before = specification([rule("RG-a", "texte")]);
    const after = specification([rule("RG-a", "texte\n")]);

    expect(compareRules(before, after)).toEqual([]);
  });

  it("flags a rule that appeared", () => {
    const before = specification([]);
    const after = specification([rule("RG-a", "texte")]);

    const [gap] = compareRules(before, after);
    expect(gap.evolution).toBe("ajoutee");
    expect(gap.before).toBeNull();
  });

  it("flags a rule whose statement changed", () => {
    const before = specification([rule("RG-a", "ancien")]);
    const after = specification([rule("RG-a", "nouveau")]);

    const [gap] = compareRules(before, after);
    expect(gap.evolution).toBe("modifiee");
    expect(gap.before?.statement).toBe("ancien");
    expect(gap.after?.statement).toBe("nouveau");
  });

  it("prefers repeal over modification when both occur", () => {
    // a repeal almost always rewrites the statement to say why:
    // reporting « modifiée » would mask the change with the widest reach
    const before = specification([rule("RG-a", "ancien")]);
    const after = specification([rule("RG-a", "ne s’applique plus", "abroge")]);

    expect(compareRules(before, after)[0].evolution).toBe("abrogee");
  });

  it("flags a disappeared rule, although it is an anomaly", () => {
    const before = specification([rule("RG-a", "texte")]);
    const after = specification([]);

    const [gap] = compareRules(before, after);
    expect(gap.evolution).toBe("retiree");
    expect(gap.after).toBeNull();
  });

  it("sorts the differences by identifier, regardless of their kind", () => {
    const before = specification([rule("RG-z", "ancien")]);
    const after = specification([
      rule("RG-a", "neuf"),
      rule("RG-z", "nouveau"),
    ]);

    expect(compareRules(before, after).map((e) => e.id)).toEqual([
      "RG-a",
      "RG-z",
    ]);
  });
});

describe("scopings delivered between two bounds", () => {
  it("keeps a scoping that moved to delivered", () => {
    const before = specification([], [scoping("2026-001", "en_relecture")]);
    const after = specification([], [scoping("2026-001", "livree")]);

    expect(listScopingsDeliveredBetween(before, after)).toEqual(["2026-001"]);
  });

  it("ignores a scoping already delivered at the start bound", () => {
    const before = specification([], [scoping("2026-001", "livree")]);
    const after = specification([], [scoping("2026-001", "livree")]);

    expect(listScopingsDeliveredBetween(before, after)).toEqual([]);
  });

  it("keeps a scoping that appeared and was delivered within the interval", () => {
    const before = specification([], []);
    const after = specification([], [scoping("2026-002", "livree")]);

    expect(listScopingsDeliveredBetween(before, after)).toEqual(["2026-002"]);
  });

  it("ignores a scoping that appeared but was not delivered", () => {
    const before = specification([], []);
    const after = specification([], [scoping("2026-002", "brouillon")]);

    expect(listScopingsDeliveredBetween(before, after)).toEqual([]);
  });
});
