import { describe, expect, it } from "vitest";
import { themeMermaid } from "./diagramme";

/**
 * Le thème du moteur suit celui de l'application.
 *
 * Le défaut corrigé : un thème clair figé laissait, en mode sombre, un texte foncé sur des formes foncées. Les diagrammes s'affichaient — des bulles sans libellé lisible —, ce qui est pire qu'une absence : rien ne signalait que quelque chose n'allait pas.
 */
describe("thème du moteur de diagramme", () => {
  it("emploie un thème sombre quand l’application est en sombre", () => {
    expect(themeMermaid("sombre")).toBe("dark");
  });

  it("emploie un thème clair quand l’application est en clair", () => {
    expect(themeMermaid("clair")).toBe("neutral");
  });
});
