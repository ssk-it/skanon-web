import { formaterAnomalie } from "@ssk-it/canon-check";
import { splitFrontmatter as canonSplit } from "@ssk-it/canon-check/format";
import { describe, expect, it } from "vitest";
import { inject } from "../injection";
import { LocaleService } from "../i18n/locale.service";
import {
  splitFrontmatter,
  isUnreadable,
  extractSection,
  extractStatements,
  extractSubsections,
} from "./frontmatter";

/** Reads a file whose frontmatter is known to be valid. */
function read(text: string) {
  const r = splitFrontmatter(text);
  if (!r || isUnreadable(r)) throw new Error("frontmatter attendu valide");
  return r;
}

/**
 * These tests are about the format itself, not about infrastructure code.
 * The parser exists twice — here and in `actions/src/parse.mjs` — and the
 * risk of divergence is identified: these cases are the ones that must
 * behave identically on both sides.
 */
describe("frontmatter", () => {
  const FILE = `---
id: RG-exemple
statut: actif
fonctionnalites: [une, deux]
---

## Objectif

Le texte de l'objectif.

## Énoncés

### RG-premiere

Premier énoncé.

### RG-seconde

Second énoncé, sur
plusieurs lignes.
`;

  it("separates the frontmatter from the body", () => {
    const r = read(FILE);
    expect(r.data["id"]).toBe("RG-exemple");
    expect(r.data["fonctionnalites"]).toEqual(["une", "deux"]);
    expect(r.body.startsWith("\n## Objectif")).toBe(true);
  });

  it("returns null without frontmatter", () => {
    expect(splitFrontmatter("# Juste du markdown")).toBeNull();
  });

  it("flags invalid YAML rather than confusing it with an absence", () => {
    // "absent" and "unreadable" call for two different fixes, and
    // only the second can say where to fix
    const r = splitFrontmatter("---\nid: [non fermé\n---\ncorps");
    expect(r).not.toBeNull();
    expect(isUnreadable(r)).toBe(true);
  });

  it("locates the faulty line in the file, not in the block", () => {
    const r = splitFrontmatter(
      "---\nid: x\ntitre: Un titre : deux-points\n---\ncorps",
    );
    expect(isUnreadable(r) && r.error).toContain("ligne 3");
  });

  it("says what to do about an unquoted « : », the most frequent fault", () => {
    const r = splitFrontmatter(
      "---\ntitre: Choisir : ceci ou cela\n---\ncorps",
    );
    expect(isUnreadable(r) && r.error).toContain("apostrophes");
  });

  it("says what to do about an unquoted « : » in English", () => {
    inject(LocaleService).choice.set("en");
    const r = splitFrontmatter(
      "---\nid: x\ntitre: Choisir : ceci ou cela\n---\ncorps",
    );
    expect(isUnreadable(r) && r.error).toContain(
      "unreadable frontmatter at line 3",
    );
    expect(isUnreadable(r) && r.error).toContain("must be in single quotes");
    expect(isUnreadable(r) && r.error).not.toContain("illisible");
  });

  // RG-parseur-partage, RG-anomalies-codees: the message is the library's, in the displayed language — not a second wording of the same fault.
  it("says the library's message, in each language", () => {
    const text = "---\nid: x\ntitre: Choisir : ceci ou cela\n---\ncorps";
    const library = canonSplit(text);
    if (!library || !("anomalie" in library)) throw new Error("readable");
    for (const language of ["fr", "en"] as const) {
      inject(LocaleService).choice.set(language);
      const r = splitFrontmatter(text);
      expect(isUnreadable(r) && r.error).toBe(
        formaterAnomalie(library.anomalie, language),
      );
    }
  });

  it("accepts Windows line endings", () => {
    expect(read("---\r\nid: x\r\n---\r\ncorps").data["id"]).toBe("x");
  });

  it("extracts a level-2 section", () => {
    const { body } = read(FILE);
    expect(extractSection(body, "Objectif")).toBe("Le texte de l'objectif.");
  });

  it("returns an empty string for a missing section", () => {
    const { body } = read(FILE);
    expect(extractSection(body, "Parcours utilisateur")).toBe("");
  });

  it("extracts the statements by rule identifier", () => {
    const { body } = read(FILE);
    const e = extractStatements(body);
    expect([...e.keys()]).toEqual(["RG-premiere", "RG-seconde"]);
    expect(e.get("RG-premiere")).toBe("Premier énoncé.");
    expect(e.get("RG-seconde")).toBe("Second énoncé, sur\nplusieurs lignes.");
  });

  it("handles an accent in the section heading", () => {
    // « Énoncés » carries an accent: the regex escaping must hold
    const e = extractStatements("## Énoncés\n\n### RG-x\n\nTexte.\n");
    expect(e.get("RG-x")).toBe("Texte.");
  });

  it("does not confuse a following section with a statement", () => {
    const body =
      "## Énoncés\n\n### RG-a\n\nA.\n\n## Autre section\n\nPas un énoncé.\n";
    const e = extractStatements(body);
    expect([...e.keys()]).toEqual(["RG-a"]);
    expect(e.get("RG-a")).toBe("A.");
  });

  it("splits the options of a decision", () => {
    const body =
      "## Options\n\n### option-a\n\nPour A.\n\n### option-b\n\nPour B.\n";
    const o = extractSubsections(body, "Options");
    expect([...o.keys()]).toEqual(["option-a", "option-b"]);
    expect(o.get("option-b")).toBe("Pour B.");
  });
});
