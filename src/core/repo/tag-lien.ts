/**
 * Réduit une nature de lien saisie à sa forme de clé.
 *
 * Rend une chaîne vide quand il ne reste rien de retenable — un champ ne portant que de la ponctuation ne fait pas une nature.
 *
 * Dans SSK Canon, la fonction vivait dans le dialogue de saisie d'un lien ; elle n'a rien d'une vue, et l'écriture d'un cadrage l'emploie aussi.
 */
export function normaliserTag(brut: string): string {
  return brut
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "");
}
