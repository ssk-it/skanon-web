import { describe, expect, it } from "vitest";
import { domainRanks, domainStyle, domainHue } from "./domain-color";

/** The domains of the reference repo. */
const REFERENCE = ["acces", "cadrage", "persistance", "referentiel"];

describe("domainHue", () => {
  it("returns the same hue for the same set of domains", () => {
    expect(domainHue("acces", REFERENCE)).toBe(domainHue("acces", REFERENCE));
  });

  it("gives a distinct hue to each domain", () => {
    // The first version's defect: « persistance » and « referentiel »
    // fell on the same colour.
    const hues = REFERENCE.map((id) => domainHue(id, REFERENCE));
    expect(new Set(hues).size).toBe(REFERENCE.length);
  });

  it("stays distinct up to a high number of domains", () => {
    const many = Array.from({ length: 24 }, (_, i) => `domaine-${i}`);
    const hues = many.map((id) => domainHue(id, many));
    expect(new Set(hues).size).toBe(many.length);
  });

  it("does not depend on the loading order", () => {
    // The tree returned by the platform has no guaranteed order: a
    // colour that depended on it would change for no visible reason.
    const mix = ["referentiel", "acces", "persistance", "cadrage"];
    for (const id of REFERENCE) {
      expect(domainHue(id, mix)).toBe(domainHue(id, REFERENCE));
    }
  });

  it("keeps its hue when a duplicate appears in the list", () => {
    const withDuplicate = [...REFERENCE, "acces"];
    for (const id of REFERENCE) {
      expect(domainHue(id, withDuplicate)).toBe(domainHue(id, REFERENCE));
    }
  });

  it("stays within the hue wheel", () => {
    for (const id of REFERENCE) {
      const t = domainHue(id, REFERENCE);
      expect(t).toBeGreaterThanOrEqual(0);
      expect(t).toBeLessThan(360);
    }
  });

  it("avoids the greenish-yellow band, whatever the number of domains", () => {
    // Seen on screen: a domain that fell on 115° gave a dull olive next
    // to its neighbours. No DOM test would have shown it.
    for (let total = 1; total <= 40; total++) {
      const ids = Array.from(
        { length: total },
        (_, i) => `d-${String(i).padStart(2, "0")}`,
      );
      for (const id of ids) {
        const t = domainHue(id, ids);
        // The upper bound is reachable: it is the first readable degree,
        // the one from which the distribution starts again.
        expect(t < 95 || t >= 155).toBe(true);
      }
    }
  });

  it("spaces hues as far as the wheel allows", () => {
    const ids = ["a", "b", "c", "d"];
    const hues = ids.map((id) => domainHue(id, ids)).sort((x, y) => x - y);
    // Four domains on a wheel of 300 usable degrees: at least 60° apart.
    for (let i = 1; i < hues.length; i++) {
      expect(hues[i] - hues[i - 1]).toBeGreaterThanOrEqual(60);
    }
  });

  it("returns a neutral hue for a domain absent from the list", () => {
    // An attachment to a missing file must not borrow the colour
    // of another domain.
    expect(domainHue("inconnu", REFERENCE)).toBe(235);
  });

  it("does not divide by zero on a repo without a domain", () => {
    expect(Number.isFinite(domainHue("quelconque", []))).toBe(true);
  });
});

describe("domainRanks", () => {
  it("orders by identifier, not by order of arrival", () => {
    const ranks = domainRanks(["referentiel", "acces", "cadrage"]);
    expect(ranks.get("acces")).toBe(0);
    expect(ranks.get("cadrage")).toBe(1);
    expect(ranks.get("referentiel")).toBe(2);
  });

  it("deduplicates", () => {
    expect(domainRanks(["a", "a", "b"]).size).toBe(2);
  });
});

describe("domainStyle", () => {
  it("carries the hue in each variable", () => {
    const style = domainStyle("cadrage", REFERENCE);
    const t = domainHue("cadrage", REFERENCE);
    expect(style["--pc-domaine-h"]).toBe(`${t}`);
    expect(style["--pc-domaine"]).toContain(`${t}`);
    expect(style["--pc-domaine-bg"]).toContain(`${t}`);
  });
});
