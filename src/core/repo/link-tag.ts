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
    .replace(/^_|_$/g, "");
}

/**
 * The kind an entry designates: a known kind's label, in the displayed language, gives its key; anything else is reduced (RG-nature-lien-normalisee). The key never derives from a translated label, which would write `trello_card` next to `carte_trello`.
 */
export function tagFromInput(
  raw: string,
  labels: Readonly<Record<string, string>>,
): string {
  const entered = normalizeTag(raw);
  const known = Object.entries(labels).find(
    ([, label]) => normalizeTag(label) === entered,
  );
  return known ? known[0] : entered;
}
