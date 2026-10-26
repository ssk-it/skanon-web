import DOMPurify from "dompurify";
import { describe, expect, it } from "vitest";

/**
 * Pourquoi les libellés disparaissaient.
 *
 * Mermaid place par défaut ses libellés dans un `foreignObject`, qui porte du HTML à l'intérieur du SVG. DOMPurify le retire — c'est un vecteur connu d'injection, et sa suppression est délibérée. Le diagramme s'affichait donc complet mais muet : des formes sans texte.
 *
 * La réponse n'est pas d'affaiblir l'assainissement pour laisser passer du HTML venu d'un dépôt, mais de demander au moteur de dessiner ses libellés en SVG.
 */
describe("libellés d’un diagramme assaini", () => {
  const enForeignObject =
    '<svg xmlns="http://www.w3.org/2000/svg"><g><foreignObject width="80" height="20">' +
    '<div xmlns="http://www.w3.org/1999/xhtml"><span>Planifié</span></div></foreignObject></g></svg>';

  const enTexteSvg =
    '<svg xmlns="http://www.w3.org/2000/svg"><g><text x="1" y="2">Planifié</text></g></svg>';

  it("un libellé en foreignObject ne survit pas — c’est voulu", () => {
    expect(
      DOMPurify.sanitize(enForeignObject, { USE_PROFILES: { svg: true } }),
    ).not.toContain("Planifié");
  });

  it("un libellé dessiné en SVG survit", () => {
    expect(
      DOMPurify.sanitize(enTexteSvg, {
        USE_PROFILES: { svg: true, svgFilters: true },
      }),
    ).toContain("Planifié");
  });
});
