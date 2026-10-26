/**
 * Detecting diagrams in rendered Markdown — RG-diagrammes-rendus.
 *
 * Separate from the rendering itself, and with no dependency on the engine: this module decides **whether** the engine will be loaded, and it must be able to answer without it. A page without a diagram thus pays nothing more than before.
 */

/** A diagram found in rendered Markdown. */
export interface FoundDiagram {
  /** Unique identifier in the page, linking the slot to its source. */
  readonly id: string;
  /** The diagram's text, as the engine expects it. */
  readonly source: string;
  /** The HTML where this block was replaced by its slot. */
  readonly html: string;
}

/** The slot a diagram occupies while waiting to be drawn. */
export function diagramMarker(id: string): string {
  return `<div class="pc-diagramme" data-diagramme="${id}"></div>`;
}

/**
 * The `mermaid` blocks of a rendered HTML, replaced by their slot.
 *
 * The text is restored to its original form: the Markdown rendering escaped the angle brackets and ampersands, which the diagram engine expects intact. Passing it the escaped text would produce a syntax error on an otherwise correct diagram — and the author would search for a long time.
 */
export function extractDiagrams(html: string): FoundDiagram[] {
  const found: FoundDiagram[] = [];
  let current = html;
  let n = 0;

  const pattern =
    /<pre><code class="language-mermaid">([\s\S]*?)<\/code><\/pre>/g;
  let m: RegExpExecArray | null;

  while ((m = pattern.exec(html)) !== null) {
    const id = `d${n++}-${Math.random().toString(36).slice(2, 8)}`;
    const source = unescape(m[1]);
    current = current.replace(m[0], diagramMarker(id));
    found.push({ id, source, html: current });
  }

  // Each entry carries the HTML as it is after its own replacement; the last one therefore carries the one where all blocks have been replaced. That is the one the caller displays.
  return found.map((d) => ({ ...d, html: current }));
}

/** Restores to the text the characters the Markdown rendering escaped. */
function unescape(text: string): string {
  return (
    text
      .replace(/&lt;/g, "<")
      .replace(/&gt;/g, ">")
      .replace(/&quot;/g, '"')
      .replace(/&#39;/g, "'")
      // The ampersand last: restoring it first would reread as an entity what was not one in the source.
      .replace(/&amp;/g, "&")
  );
}

/**
 * The engine's theme, deduced from the application's.
 *
 * A frozen theme leaves, in the other mode, text the colour of the shapes carrying it: the diagram displays, its labels are unreadable. That is costlier than an absence — nothing signals that something is missing, and the reader believes the diagram is meant to look that way.
 */
export function themeMermaid(
  effective: "clair" | "sombre",
): "dark" | "neutral" {
  return effective === "sombre" ? "dark" : "neutral";
}
