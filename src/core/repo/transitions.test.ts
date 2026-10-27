import { describe, expect, it } from "vitest";
import { isOnItsBranch } from "./authoring.service";

/**
 * A scoping is recognised by its branch, never by the branch's name.
 *
 * These cases come from an observed defect: status transitions were invisible
 * on every real scoping. The test relied on the « cadrage/ » prefix the
 * application uses at creation, whereas existing branches all follow
 * « cadrage-<id> » — see RG-branche-par-cadrage.
 */
describe("recognising a scoping's branch", () => {
  it("recognises a branch named « cadrage-<id> »", () => {
    expect(isOnItsBranch("cadrage-2026-002", "main")).toBe(true);
  });

  it("recognises a branch named « cadrage/<id> »", () => {
    expect(isOnItsBranch("cadrage/2026-002", "main")).toBe(true);
  });

  it("recognises a branch named quite otherwise", () => {
    expect(isOnItsBranch("brouillon-de-sebastien", "main")).toBe(true);
  });

  it("refuses the main branch, whatever its name", () => {
    expect(isOnItsBranch("main", "main")).toBe(false);
    expect(isOnItsBranch("master", "master")).toBe(false);
  });

  it("refuses when the branch or the main one is unknown", () => {
    // offering a transition that cannot be placed is worth less than nothing
    expect(isOnItsBranch(undefined, "main")).toBe(false);
    expect(isOnItsBranch("cadrage-2026-002", "")).toBe(false);
  });
});
