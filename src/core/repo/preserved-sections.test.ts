import { describe, expect, it } from "vitest";
import {
  extractOtherSections,
  extractFreeSections,
  extractSection,
  KNOWN_SECTIONS,
} from "./frontmatter";
import { serializeScoping } from "./authoring.service";

/**
 * A scoping carries what its author deems useful. Rebuilding the file from
 * only the sections the editor presents would erase the others without a
 * word — it happened on a real scoping, which lost twenty-three lines of
 * open questions.
 */
const KNOWN = KNOWN_SECTIONS;

const BODY = `## Objectif

Ce qu'on cherche.

## Questions ouvertes

- **Qui peut déclarer ?** Reste à instruire.
- **Faut-il relancer ?** Le délai est de 72 heures.

## Parcours utilisateur

1. Il ouvre l'écran.

## Notes

Une note libre.
`;

describe("sections a scoping carries of its own", () => {
  it("returns those the editor does not present, headings included", () => {
    const others = extractOtherSections(BODY, KNOWN);
    expect(others).toContain("## Questions ouvertes");
    expect(others).toContain("## Notes");
    expect(others).toContain("Qui peut déclarer");
  });

  it("leaves out those the editor already knows how to write", () => {
    const others = extractOtherSections(BODY, KNOWN);
    expect(others).not.toContain("## Objectif");
    expect(others).not.toContain("## Parcours utilisateur");
  });

  it("returns an empty string when everything is known", () => {
    expect(extractOtherSections("## Objectif\n\nX.\n", KNOWN)).toBe("");
  });

  it("keeps them on rewrite", () => {
    // The case that failed for real: saving again without touching anything.
    const out = serializeScoping("2026-001", {
      title: "Un cadrage",
      domains: ["contrats"],
      goal: "Ce qu’on cherche.",
      journey: "1. Il ouvre l’écran.",
      impacts: [],
      unknownSections: extractOtherSections(BODY, KNOWN),
    });

    expect(out).toContain("## Questions ouvertes");
    expect(out).toContain("Faut-il relancer");
    expect(out).toContain("## Notes");
    expect(extractSection(out, "Objectif")).toContain("cherche");
  });

  it("writes nothing superfluous when there is no section of its own", () => {
    const out = serializeScoping("2026-001", {
      title: "Un cadrage",
      domains: [],
      goal: "X.",
      journey: "Y.",
      impacts: [],
      unknownSections: "",
    });
    expect(out.trimEnd().endsWith("Y.")).toBe(true);
  });

  it("stays stable from one save to the next", () => {
    // The defect found for real: the file gained an empty line on every save,
    // the separator's whitespace adding to the one the block already carried.
    // Re-extracting what was just written must give back the same thing.
    const write = (others: string) =>
      serializeScoping("2026-001", {
        title: "Un cadrage",
        domains: [],
        goal: "X.",
        journey: "Y.",
        impacts: [],
        unknownSections: others,
      });

    const first = write(extractOtherSections(BODY, KNOWN));
    const second = write(extractOtherSections(first, KNOWN));
    expect(second).toBe(first);
  });

  it("survives a scoping with no section at all", () => {
    expect(extractOtherSections("", KNOWN)).toBe("");
    expect(extractOtherSections("Du texte sans titre.", KNOWN)).toBe("");
  });
});

/**
 * Preserving them was not enough: written and never shown, they were lost
 * to the reader. The page gathers them under « Divers », hence the split
 * heading by heading — the original heading says what the section is about.
 */
describe("sections gathered under « Divers »", () => {
  it("returns each free section with its heading and its body", () => {
    const free = extractFreeSections(BODY, KNOWN);

    expect(free.map((s) => s.title)).toEqual(["Questions ouvertes", "Notes"]);
    expect(free[0].body).toContain("Qui peut déclarer");
    expect(free[0].body).not.toContain("##");
    expect(free[1].body).toBe("Une note libre.");
  });

  it("keeps level-3 subsections in the body that carries them", () => {
    // The case that motivated the screen: an observation written as « ### »
    // under a free section. Splitting at level 3 would have taken it out of
    // its context.
    const body = `## Ce que la mesure a montré

Le relevé.

### Une observation, hors périmètre

Ce qu'elle dit.
`;
    const [section] = extractFreeSections(body, KNOWN);

    expect(section.title).toBe("Ce que la mesure a montré");
    expect(section.body).toContain("### Une observation, hors périmètre");
    expect(section.body).toContain("Ce qu'elle dit.");
  });

  it("returns nothing when everything is known", () => {
    expect(extractFreeSections("## Objectif\n\nX.\n", KNOWN)).toEqual([]);
    expect(extractFreeSections("", KNOWN)).toEqual([]);
  });

  it("says the same thing as the text preserved on rewrite", () => {
    // Both outputs come from the same split: if they diverged, the page would
    // show something other than what the save keeps.
    const expected = extractFreeSections(BODY, KNOWN)
      .map((s) => `## ${s.title}\n\n${s.body}`)
      .join("\n\n");

    expect(extractOtherSections(BODY, KNOWN)).toBe(expected);
  });
});
