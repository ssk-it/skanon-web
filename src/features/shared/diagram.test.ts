import { describe, expect, it } from "vitest";
import { extractDiagrams, diagramMarker } from "./diagram";

/**
 * Le repérage des diagrammes dans du Markdown — RG-diagrammes-rendus.
 *
 * Le rendu lui-même est asynchrone et dépend du moteur ; ce qui est éprouvé ici est ce qui décide **si** le moteur sera chargé. Se tromper dans un sens fait payer 500 Ko à une page qui n'a aucun diagramme ; dans l'autre, laisse un diagramme en texte brut sans que rien ne le signale.
 */
describe("repérage des diagrammes", () => {
  it("ne trouve rien dans un Markdown ordinaire", () => {
    const html =
      '<p>Un texte.</p><pre><code class="language-java">int a;</code></pre>';
    expect(extractDiagrams(html)).toEqual([]);
  });

  it("trouve un bloc mermaid et le remplace par un marqueur", () => {
    const html =
      '<pre><code class="language-mermaid">flowchart LR\n  A --&gt; B</code></pre>';
    const found = extractDiagrams(html);

    expect(found.length).toBe(1);
    // Le texte est rendu à sa forme d'origine : `marked` a échappé les chevrons, que le moteur de diagramme attend intacts.
    expect(found[0]!.source).toBe("flowchart LR\n  A --> B");
  });

  it("distingue plusieurs diagrammes d’une même page", () => {
    const html =
      '<pre><code class="language-mermaid">flowchart LR</code></pre>' +
      "<p>Entre les deux.</p>" +
      '<pre><code class="language-mermaid">sequenceDiagram</code></pre>';
    const found = extractDiagrams(html);

    expect(found.map((d) => d.source)).toEqual([
      "flowchart LR",
      "sequenceDiagram",
    ]);
    // Deux marqueurs distincts : rendre le second dans le premier emplacement afficherait un diagramme à la place d'un autre, sans erreur visible.
    expect(found[0]!.id).not.toBe(found[1]!.id);
  });

  it("laisse dans le HTML un emplacement pour chaque diagramme", () => {
    const html =
      '<pre><code class="language-mermaid">flowchart LR</code></pre>';
    const found = extractDiagrams(html);
    const expected = diagramMarker(found[0]!.id);

    expect(found[0]!.html).toContain(expected);
    // La source ne doit plus figurer dans le HTML rendu : un diagramme affiché à la fois en image et en texte double la section.
    expect(found[0]!.html).not.toContain("flowchart LR");
  });
});
