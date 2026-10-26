import DOMPurify from "dompurify";
import { describe, expect, it } from "vitest";

/**
 * Why labels were disappearing.
 *
 * Mermaid places its labels in a `foreignObject` by default, which carries HTML inside the SVG. DOMPurify removes it — it is a known injection vector, and its removal is deliberate. The diagram therefore displayed complete but mute: shapes without text.
 *
 * The answer is not to weaken the sanitising to let through HTML coming from a repo, but to ask the engine to draw its labels in SVG.
 */
describe("labels of a sanitised diagram", () => {
  const inForeignObject =
    '<svg xmlns="http://www.w3.org/2000/svg"><g><foreignObject width="80" height="20">' +
    '<div xmlns="http://www.w3.org/1999/xhtml"><span>Planifié</span></div></foreignObject></g></svg>';

  const asSvgText =
    '<svg xmlns="http://www.w3.org/2000/svg"><g><text x="1" y="2">Planifié</text></g></svg>';

  it("a foreignObject label does not survive — this is intended", () => {
    expect(
      DOMPurify.sanitize(inForeignObject, { USE_PROFILES: { svg: true } }),
    ).not.toContain("Planifié");
  });

  it("a label drawn in SVG survives", () => {
    expect(
      DOMPurify.sanitize(asSvgText, {
        USE_PROFILES: { svg: true, svgFilters: true },
      }),
    ).toContain("Planifié");
  });
});
