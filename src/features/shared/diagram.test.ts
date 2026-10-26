import { describe, expect, it } from "vitest";
import { extractDiagrams, diagramMarker } from "./diagram";

/**
 * Detecting diagrams in Markdown — RG-diagrammes-rendus.
 *
 * The rendering itself is asynchronous and depends on the engine; what is tested here is what decides **whether** the engine will be loaded. Getting it wrong one way makes a page with no diagram pay 500 KB; the other way, leaves a diagram as raw text with nothing signalling it.
 */
describe("diagram detection", () => {
  it("finds nothing in ordinary Markdown", () => {
    const html =
      '<p>Un texte.</p><pre><code class="language-java">int a;</code></pre>';
    expect(extractDiagrams(html)).toEqual([]);
  });

  it("finds a mermaid block and replaces it with a marker", () => {
    const html =
      '<pre><code class="language-mermaid">flowchart LR\n  A --&gt; B</code></pre>';
    const found = extractDiagrams(html);

    expect(found.length).toBe(1);
    // The text is restored to its original form: `marked` escaped the angle brackets, which the diagram engine expects intact.
    expect(found[0]!.source).toBe("flowchart LR\n  A --> B");
  });

  it("distinguishes several diagrams on the same page", () => {
    const html =
      '<pre><code class="language-mermaid">flowchart LR</code></pre>' +
      "<p>Entre les deux.</p>" +
      '<pre><code class="language-mermaid">sequenceDiagram</code></pre>';
    const found = extractDiagrams(html);

    expect(found.map((d) => d.source)).toEqual([
      "flowchart LR",
      "sequenceDiagram",
    ]);
    // Two distinct markers: rendering the second into the first slot would display one diagram in place of another, with no visible error.
    expect(found[0]!.id).not.toBe(found[1]!.id);
  });

  it("leaves a slot in the HTML for each diagram", () => {
    const html =
      '<pre><code class="language-mermaid">flowchart LR</code></pre>';
    const found = extractDiagrams(html);
    const expected = diagramMarker(found[0]!.id);

    expect(found[0]!.html).toContain(expected);
    // The source must no longer appear in the rendered HTML: a diagram displayed both as an image and as text doubles the section.
    expect(found[0]!.html).not.toContain("flowchart LR");
  });
});
