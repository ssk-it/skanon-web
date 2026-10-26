import { describe, expect, it } from "vitest";
import { parseAccessMode, parseIdentity } from "./repo-loader";
import { isOnItsBranch } from "./authoring.service";

describe("access mode declared by the project", () => {
  it("keeps the personal token when nothing is declared", () => {
    // it is the only mode that requires hosting nothing: a project that sets
    // nothing must work
    const { access, anomaly } = parseAccessMode(undefined);
    expect(access).toBe("jeton_personnel");
    expect(anomaly).toBeNull();
  });

  it("reads a known mode", () => {
    expect(parseAccessMode("relais").access).toBe("relais");
    expect(parseAccessMode("identite_tierce").access).toBe("identite_tierce");
  });

  it("reports an unknown mode rather than putting up with it", () => {
    // keeping quiet would let the project believe it applies a setting it
    // does not apply
    const { access, anomaly } = parseAccessMode("oauth");
    expect(access).toBe("jeton_personnel");
    expect(anomaly).toContain("oauth");
  });

  it("names the expected modes in the anomaly", () => {
    expect(parseAccessMode("inventé").anomaly).toContain("jeton_personnel");
  });
});

describe("third-party identity parameters", () => {
  // The `identite` block as the configuration file writes it, in French, and what the read makes of it.
  const BLOCK = {
    emetteur: "http://localhost:8088/realms/ssk-canon",
    client: "ssk-canon-pwa",
    echange: "http://localhost:8790",
  };
  const COMPLETE = {
    issuer: BLOCK.emetteur,
    client: BLOCK.client,
    exchange: BLOCK.echange,
  };

  it("returns null when nothing is declared", () => {
    const { identity, anomalies } = parseIdentity(undefined);
    expect(identity).toBeNull();
    expect(anomalies).toEqual([]);
  });

  it("reads a complete block", () => {
    expect(parseIdentity(BLOCK).identity).toEqual(COMPLETE);
  });

  it("removes a trailing slash, which would double the separators", () => {
    const { identity } = parseIdentity({
      ...BLOCK,
      emetteur: BLOCK.emetteur + "/",
    });
    expect(identity?.issuer).toBe(COMPLETE.issuer);
  });

  it("returns null on an incomplete block, rather than an object with holes", () => {
    // sign-in would fail anyway; failing at load at least leaves the
    // specification readable and the anomaly visible
    const { identity, anomalies } = parseIdentity({
      emetteur: BLOCK.emetteur,
    });
    expect(identity).toBeNull();
    expect(anomalies.length).toBe(2);
  });

  it("names the missing field", () => {
    const { anomalies } = parseIdentity({ ...BLOCK, client: "" });
    expect(anomalies.some((a) => a.includes("identite.client"))).toBe(true);
  });

  it("refuses a malformed address", () => {
    // it would otherwise be discovered at sign-in time, far from its cause
    const { identity, anomalies } = parseIdentity({
      ...BLOCK,
      emetteur: "keycloak",
    });
    expect(identity).toBeNull();
    expect(anomalies.some((a) => a.includes("adresse valide"))).toBe(true);
  });

  it("does not require the client to be an address", () => {
    expect(parseIdentity(BLOCK).anomalies).toEqual([]);
  });
});

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
