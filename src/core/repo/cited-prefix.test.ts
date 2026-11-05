import { describe, expect, it } from "vitest";
import { locateReference, RULE_SHAPE } from "./scoping-reference";

/**
 * A prefix designates the project or a specification it cites —
 * RG-prefixe-projet, as scoping 2026-068 amends it.
 *
 * The cited prefix is an alias the citing project chose in
 * `referentiels_cites`: it says which repo the identifier lives in, and leads
 * there. A prefix that is neither still designates an unknown address.
 */
const PROJECT = {
  prefix: "PRMCO",
  citedRepos: [
    { prefix: "socle", repo: { owner: "org", repo: "socle-cadrage" } },
  ],
};

describe("locating a prefixed reference", () => {
  it("keeps a bare identifier here", () => {
    expect(locateReference("2026-002", PROJECT)).toEqual({
      repo: null,
      id: "2026-002",
    });
  });

  it("keeps the project's own prefix here", () => {
    expect(locateReference("PRMCO-2026-002", PROJECT)).toEqual({
      repo: null,
      id: "2026-002",
    });
  });

  it("leads a cited prefix to the repo it designates", () => {
    expect(locateReference("socle-2026-012", PROJECT)).toEqual({
      repo: { owner: "org", repo: "socle-cadrage" },
      prefix: "socle",
      id: "2026-012",
    });
  });

  it("accepts the citation's colon as well as the displayed hyphen", () => {
    // `socle:RG-…@2026-012` is how a citation is written; whoever copies its
    // identifier must land on the same page.
    expect(locateReference("socle:2026-012", PROJECT)).toEqual({
      repo: { owner: "org", repo: "socle-cadrage" },
      prefix: "socle",
      id: "2026-012",
    });
  });

  it("refuses a prefix that designates neither", () => {
    expect(locateReference("AUTRE-2026-002", PROJECT)).toBeNull();
    expect(locateReference("autre:2026-002", PROJECT)).toBeNull();
  });

  it("refuses a cited prefix followed by no identifier", () => {
    expect(locateReference("socle-RG-x", PROJECT)).toBeNull();
    expect(locateReference("socle:", PROJECT)).toBeNull();
  });

  it("locates a rule cited under a prefix", () => {
    expect(
      locateReference("socle:RG-nommage-des-roles", PROJECT, RULE_SHAPE),
    ).toEqual({
      repo: { owner: "org", repo: "socle-cadrage" },
      prefix: "socle",
      id: "RG-nommage-des-roles",
    });
  });

  it("keeps a bare rule identifier here", () => {
    expect(locateReference("RG-limite", PROJECT, RULE_SHAPE)).toEqual({
      repo: null,
      id: "RG-limite",
    });
  });

  it("accepts the bare form when the project cites nothing", () => {
    expect(
      locateReference("2026-002", { prefix: null, citedRepos: [] }),
    ).toEqual({ repo: null, id: "2026-002" });
  });
});
