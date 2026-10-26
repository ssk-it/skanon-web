/**
 * Reduces an entered link kind to its key form.
 *
 * Returns an empty string when nothing keepable remains — a field carrying only punctuation does not make a kind.
 *
 * In SSK Canon, the function lived in the link entry dialog; it is nothing like a view, and writing a scoping uses it too.
 */
export function normalizeTag(raw: string): string {
  return raw
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "");
}
