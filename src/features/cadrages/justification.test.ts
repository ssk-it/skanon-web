import { describe, expect, it } from "vitest";
import { extractJustification } from "./justification";

describe("extractJustification", () => {
  it("rend le texte qui suit le marqueur", () => {
    const corps = `**Retenue.** Distinguer les trois situations, chacune déductible
de ce qui est connu.

**Pour** — chaque mention est vérifiable.`;
    expect(extractJustification(corps)).toBe(
      "Distinguer les trois situations, chacune déductible de ce qui est connu.",
    );
  });

  it("s'arrête à l'argumentaire même sans ligne vide", () => {
    const corps = `**Retenue.** Le choix tient en une phrase.
**Pour** — un argument qui ne doit pas remonter.`;
    expect(extractJustification(corps)).toBe("Le choix tient en une phrase.");
  });

  // Le marqueur est une convention de rédaction, pas une garantie du format :
  // sans lui, mieux vaut ne rien afficher qu'un texte pris au hasard.
  it("rend une chaîne vide quand le marqueur manque", () => {
    expect(extractJustification("Une option décrite sans marqueur.")).toBe("");
  });

  it("retire le balisage inline", () => {
    const corps = "**Retenue.** Un **gras**, un `code` et un [lien](http://x).";
    expect(extractJustification(corps)).toBe("Un gras, un code et un lien.");
  });

  it("accepte le marqueur sans point", () => {
    expect(extractJustification("**Retenue** Le texte.")).toBe("Le texte.");
  });
});
