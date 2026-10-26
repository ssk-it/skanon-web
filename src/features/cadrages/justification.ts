/**
 * Extrait la justification d'une option retenue : le texte introduit par
 * « **Retenue.** » en tête de son corps.
 *
 * Ce marqueur est une convention de rédaction, pas une garantie du format —
 * rien dans le parsing ne l'impose. L'extraction rend donc une chaîne vide
 * quand il manque, et l'appelant n'affiche rien plutôt qu'un texte pris au
 * hasard : mieux vaut une ligne absente qu'un « Pour — … » présenté comme la
 * raison du choix.
 *
 * Le résultat est du texte nu, sur une ligne. Le panneau récapitulatif le pose
 * dans un espace étroit où le Markdown rendu — gras, listes, paragraphes —
 * pèserait plus qu'il n'apporterait ; le corps complet reste lisible dans la
 * fiche, à sa place.
 */
export function extractJustification(body: string): string {
  const marker = /\*\*Retenue\.?\*\*\s*/;
  const departure = body.search(marker);
  if (departure === -1) return "";

  const after = body.slice(departure).replace(marker, "");

  // S'arrêter au premier argument : « Pour » et « Contre » pèsent le choix,
  // ils ne l'énoncent pas.
  const end = after.search(/\n\s*\n|\*\*(?:Pour|Contre)\b/);
  const raw = end === -1 ? after : after.slice(0, end);

  return normalizeText(raw);
}

/** Replie les retours à la ligne du Markdown et retire le balisage inline. */
function normalizeText(raw: string): string {
  return raw
    .replace(/\*\*(.+?)\*\*/g, "$1")
    .replace(/\*(.+?)\*/g, "$1")
    .replace(/`(.+?)`/g, "$1")
    .replace(/\[(.+?)\]\(.*?\)/g, "$1")
    .replace(/\s+/g, " ")
    .trim();
}
