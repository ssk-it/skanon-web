/**
 * Reads a diagram with the engine that draws it — scoping 2026-074 of ssk-it/ssk-canon.
 *
 * Given by the views to `VerificationService.checkDiagrams`: the core imports no renderer (docs/practices.md, « Layers »). The engine is loaded on first use, and shared with display, which imports the same module; reading needs no initialisation, theme or security level, which only concern drawing.
 */
export async function parseDiagram(text: string): Promise<unknown> {
  const mermaid = (await import("mermaid")).default;
  return mermaid.parse(text);
}
