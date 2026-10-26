import { describe, expect, it } from "vitest";
import { extractJustification } from "./justification";

describe("extractJustification", () => {
  it("returns the text following the marker", () => {
    const body = `**Retenue.** Distinguer les trois situations, chacune déductible
de ce qui est connu.

**Pour** — chaque mention est vérifiable.`;
    expect(extractJustification(body)).toBe(
      "Distinguer les trois situations, chacune déductible de ce qui est connu.",
    );
  });

  it("stops at the argument even without a blank line", () => {
    const body = `**Retenue.** Le choix tient en une phrase.
**Pour** — un argument qui ne doit pas remonter.`;
    expect(extractJustification(body)).toBe("Le choix tient en une phrase.");
  });

  // The marker is an authoring convention, not a guarantee of the format:
  // without it, better to display nothing than a text picked at random.
  it("returns an empty string when the marker is missing", () => {
    expect(extractJustification("Une option décrite sans marqueur.")).toBe("");
  });

  it("removes inline markup", () => {
    const body = "**Retenue.** Un **gras**, un `code` et un [lien](http://x).";
    expect(extractJustification(body)).toBe("Un gras, un code et un lien.");
  });

  // `\[([^\]]+)\]` retries from each opening bracket up to the last one: two
  // hundred thousand of them take a quarter of a minute, past the timeout.
  it("stays linear on a long run of opening brackets", () => {
    const brackets = "[".repeat(200_000);
    expect(extractJustification(`**Retenue.** ${brackets}`)).toBe(brackets);
  });

  it("accepts the marker without a period", () => {
    expect(extractJustification("**Retenue** Le texte.")).toBe("Le texte.");
  });
});
