import { describe, expect, it } from "vitest";
import {
  nextScopingId,
  serializeNewScoping,
  serializeScoping,
  EditableScoping,
} from "./authoring.service";
import {
  splitFrontmatter,
  isUnreadable,
  extractSection,
  extractStatements,
} from "./frontmatter";

/**
 * The file produced here is read by the integrity checker, which blocks the
 * pull request if it does not fit. These cases are therefore about what this file
 * must guarantee, not about the caller's comfort.
 */
describe("next scoping identifier", () => {
  it("starts at 001 for a year without scopings", () => {
    expect(nextScopingId([], 2026)).toBe("2026-001");
  });

  it("follows the highest sequence of the year", () => {
    expect(nextScopingId(["2026-001", "2026-013", "2026-007"], 2026)).toBe(
      "2026-014",
    );
  });

  it("ignores the scopings of other years", () => {
    expect(nextScopingId(["2025-042", "2026-002"], 2026)).toBe("2026-003");
  });

  it("never fills a gap", () => {
    // an abandoned identifier stays burnt: reusing it would make
    // old references point to an unrelated scoping
    expect(nextScopingId(["2026-001", "2026-002", "2026-005"], 2026)).toBe(
      "2026-006",
    );
  });

  it("ignores an off-format identifier", () => {
    expect(nextScopingId(["brouillon", "2026-004"], 2026)).toBe("2026-005");
  });
});

describe("serialization of a new scoping", () => {
  const BASE = {
    title: "Un titre ordinaire",
    domains: ["cadrage", "referentiel"],
    goal: "Le pourquoi.",
    journey: "1. Une étape.",
  };

  function reread(text: string) {
    const r = splitFrontmatter(text);
    if (!r || isUnreadable(r))
      throw new Error(`frontmatter illisible : ${text}`);
    return r;
  }

  it("produces a frontmatter the product's parser can re-read", () => {
    const { data } = reread(serializeNewScoping("2026-014", BASE));
    expect(data["id"]).toBe("2026-014");
    // No status: it is derived from the repo state, and the Action's checker
    // rejects a scoping that declares one.
    expect(data["statut"]).toBeUndefined();
    expect(data["domaines"]).toEqual(["cadrage", "referentiel"]);
  });

  it("escapes a title containing « : », which otherwise breaks the YAML", () => {
    // the format's most frequent fault, met in real use
    const text = serializeNewScoping("2026-014", {
      ...BASE,
      title: "Écriture : par où commencer ?",
    });
    expect(reread(text).data["titre"]).toBe("Écriture : par où commencer ?");
  });

  it("escapes a quote in an escaped title", () => {
    const text = serializeNewScoping("2026-014", {
      ...BASE,
      title: "L'écriture : c'est parti",
    });
    expect(reread(text).data["titre"]).toBe("L'écriture : c'est parti");
  });

  it("does not escape a title that does not need it", () => {
    expect(serializeNewScoping("2026-014", BASE)).toContain(
      "titre: Un titre ordinaire\n",
    );
  });

  it("declares empty impacts rather than omitting them", () => {
    // a new scoping impacts nothing yet; omitting the key would make reading
    // fail for whoever assumes it is present
    expect(
      reread(serializeNewScoping("2026-014", BASE)).data["impacts"],
    ).toEqual([]);
  });

  it("accepts a scoping without a domain", () => {
    const text = serializeNewScoping("2026-014", {
      ...BASE,
      domains: [],
    });
    expect(reread(text).data["domaines"]).toEqual([]);
  });

  it("renders the sections the format expects", () => {
    const { body } = reread(serializeNewScoping("2026-014", BASE));
    expect(extractSection(body, "Objectif")).toBe("Le pourquoi.");
    expect(extractSection(body, "Parcours utilisateur")).toBe("1. Une étape.");
  });
});

describe("serialization of a scoping with impacts", () => {
  const BASE: EditableScoping = {
    title: "Un cadrage",
    domains: ["cadrage"],
    goal: "Le pourquoi.",
    journey: "1. Une étape.",
    impacts: [],
  };

  function reread(text: string) {
    const r = splitFrontmatter(text);
    if (!r || isUnreadable(r))
      throw new Error(`frontmatter illisible : ${text}`);
    return r;
  }

  it("renders impacts the parser can re-read", () => {
    const text = serializeScoping("2026-020", {
      ...BASE,
      impacts: [
        { target: "RG-a", operation: "cree", statement: "Texte A." },
        { target: "RG-b", operation: "touche", statement: "" },
      ],
    });
    // The file carries `regle:` — the field the « regle » kind writes,
    // and what the parser re-reads.
    expect(reread(text).data["impacts"]).toEqual([
      { regle: "RG-a", operation: "cree" },
      { regle: "RG-b", operation: "touche" },
    ]);
  });

  it("places each statement under a heading carrying its rule's identifier", () => {
    const text = serializeScoping("2026-020", {
      ...BASE,
      impacts: [
        {
          target: "RG-a",
          operation: "modifie",
          statement: "Le nouvel énoncé.",
        },
      ],
    });
    expect(extractStatements(reread(text).body).get("RG-a")).toBe(
      "Le nouvel énoncé.",
    );
  });

  it("omits the Énoncés section when there is nothing to state", () => {
    // an empty section would suggest to the reader that something is missing
    const text = serializeScoping("2026-020", {
      ...BASE,
      impacts: [{ target: "RG-b", operation: "touche", statement: "" }],
    });
    expect(text).not.toContain("## Énoncés");
  });

  it("writes no status, which the checker would reject", () => {
    // The status lives on the pull request, not in the file. Writing it there
    // produced a scoping rejected in continuous integration.
    expect(
      reread(serializeScoping("2026-020", BASE)).data["statut"],
    ).toBeUndefined();
  });
});
