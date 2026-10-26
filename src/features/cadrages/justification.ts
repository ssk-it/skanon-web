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
export function extractJustification(corps: string): string {
  const marqueur = /\*\*Retenue\.?\*\*\s*/;
  const depart = corps.search(marqueur);
  if (depart === -1) return "";

  const apres = corps.slice(depart).replace(marqueur, "");

  // S'arrêter au premier argument : « Pour » et « Contre » pèsent le choix,
  // ils ne l'énoncent pas.
  const fin = apres.search(/\n\s*\n|\*\*(?:Pour|Contre)\b/);
  const brut = fin === -1 ? apres : apres.slice(0, fin);

  return normalizeTexte(brut);
}

/** Replie les retours à la ligne du Markdown et retire le balisage inline. */
function normalizeTexte(brut: string): string {
  return brut
    .replace(/\*\*(.+?)\*\*/g, "$1")
    .replace(/\*(.+?)\*/g, "$1")
    .replace(/`(.+?)`/g, "$1")
    .replace(/\[(.+?)\]\(.*?\)/g, "$1")
    .replace(/\s+/g, " ")
    .trim();
}
