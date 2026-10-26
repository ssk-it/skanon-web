import { describe, expect, it } from "vitest";
import { buildExcerpt } from "./FeaturePage.vue";

/**
 * A rule's excerpt, under its identifier on a feature's page.
 *
 * Specification statements are wrapped at around 80 columns: a line of the file is not a sentence. The excerpt rejoins the first paragraph and keeps its first sentence.
 */
describe("buildExcerpt", () => {
  it("rejoins a sentence wrapped over several lines", () => {
    const statement = `L'application **dit elle-même ce qu'elle fait** de ce qu'on lui confie : où
vont les jetons, et chaque hôte qu'elle contacte.

Ce qu'elle en dit est une annonce.
`;

    expect(buildExcerpt(statement)).toBe(
      "L'application dit elle-même ce qu'elle fait de ce qu'on lui confie : où vont les jetons, et chaque hôte qu'elle contacte.",
    );
  });

  it("stops at the end of the first sentence", () => {
    const statement = `L'aide a sa propre adresse, \`/aide\`. Elle est hors de tout
projet, comme l'accueil.
`;

    expect(buildExcerpt(statement)).toBe("L'aide a sa propre adresse, /aide.");
  });

  it("does not spill over into the next paragraph when the first has no period", () => {
    const statement = `

Une barre du bas, présente sur tous les écrans
- porte ce qu'on ne cherche pas

Un autre paragraphe.
`;

    expect(buildExcerpt(statement)).toBe(
      "Une barre du bas, présente sur tous les écrans - porte ce qu'on ne cherche pas",
    );
  });

  it("does not cut on a period not followed by whitespace", () => {
    expect(buildExcerpt("Le format 1.5 reste lu. La suite.")).toBe(
      "Le format 1.5 reste lu.",
    );
  });

  it("returns an empty string for an empty statement", () => {
    expect(buildExcerpt("\n\n")).toBe("");
  });
});
