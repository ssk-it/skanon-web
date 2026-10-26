/**
 * Extracts the justification of a chosen option: the text introduced by
 * « **Retenue.** » at the head of its body.
 *
 * This marker is an authoring convention, not a guarantee of the format —
 * nothing in the parsing enforces it. The extraction therefore returns an empty
 * string when it is missing, and the caller displays nothing rather than a text
 * picked at random: better a missing line than a « Pour — … » presented as the
 * reason for the choice.
 *
 * The result is plain text, on one line. The summary panel places it in a
 * narrow space where rendered Markdown — bold, lists, paragraphs — would weigh
 * more than it would bring; the full body stays readable on the scoping page,
 * in its place.
 */
export function extractJustification(body: string): string {
  const marker = /\*\*Retenue\.?\*\*\s*/;
  const departure = body.search(marker);
  if (departure === -1) return "";

  const after = body.slice(departure).replace(marker, "");

  // Stop at the first argument: « Pour » and « Contre » weigh the choice,
  // they do not state it.
  const end = after.search(/\n\s*\n|\*\*(?:Pour|Contre)\b/);
  const raw = end === -1 ? after : after.slice(0, end);

  return normalizeText(raw);
}

/**
 * Folds Markdown line breaks and removes inline markup.
 *
 * A link's text excludes `[`: an attempt then stops at the next bracket instead of scanning to the last one, which made a long run of brackets quadratic.
 */
function normalizeText(raw: string): string {
  return raw
    .replace(/\*\*(.+?)\*\*/g, "$1")
    .replace(/\*(.+?)\*/g, "$1")
    .replace(/`(.+?)`/g, "$1")
    .replace(/\[([^[\]]+)\]\([^)]*\)/g, "$1")
    .replace(/\s+/g, " ")
    .trim();
}
