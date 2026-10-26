import { describe, expect, it } from "vitest";
import { deriveStatus } from "./derived-status";
import { ScopingProvenance } from "../model/model";

describe("deriveStatus", () => {
  const onBranch = (p: Partial<ScopingProvenance> = {}): ScopingProvenance => ({
    branch: "cadrage/2026-001",
    pullRequest: 7,
    draft: false,
    ...p,
  });

  it("treats what the default branch carries as delivered", () => {
    // No provenance: the loader only sets it on pull request branches.
    expect(deriveStatus(undefined)).toBe("livree");
  });

  it("returns « brouillon » when the pull request is a draft", () => {
    expect(deriveStatus(onBranch({ draft: true }))).toBe("brouillon");
  });

  it("returns « en_relecture » when the pull request is open with no review given", () => {
    expect(deriveStatus(onBranch({ approval: "REVIEW_REQUIRED" }))).toBe(
      "en_relecture",
    );
  });

  it("returns « validee » when the pull request is approved", () => {
    expect(deriveStatus(onBranch({ approval: "APPROVED" }))).toBe("validee");
  });

  it("stays in review when changes are requested", () => {
    expect(deriveStatus(onBranch({ approval: "CHANGES_REQUESTED" }))).toBe(
      "en_relecture",
    );
  });

  it("derives no approval from an unknown approval state", () => {
    // `null` says "I don't know" — a REST read, or a failed call —
    // and not "not approved". Concluding « validee » there would be a lie.
    expect(deriveStatus(onBranch({ approval: null }))).toBe("en_relecture");
    expect(deriveStatus(onBranch())).toBe("en_relecture");
  });

  it("gives the draft priority over an approval", () => {
    // A pull request approved then turned back into a draft is no longer up for review:
    // its author took it back, and that is what must be shown.
    expect(deriveStatus(onBranch({ draft: true, approval: "APPROVED" }))).toBe(
      "brouillon",
    );
  });
});
