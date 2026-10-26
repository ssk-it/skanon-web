import {
  FORMATS_IDENTITE,
  POIDS_MAX_IDENTITE,
  VARIANTES_IDENTITE,
  lireNomIdentite,
} from "@ssk-it/canon-check/identite";

/**
 * Les noms de l'identité d'un projet sont des règles du format : ils viennent
 * de la bibliothèque que la vérification applique aussi (RG-parseur-partage).
 * Les tenir ici à part ferait diverger les deux listes, et un fichier que la
 * vérification accepte ne s'afficherait pas. Ne reste propre à l'application
 * que le choix du fichier à montrer selon le fond (RG-identite-affichee).
 */
export {
  FORMATS_IDENTITE,
  POIDS_MAX_IDENTITE,
  REPERTOIRE_IDENTITE,
  VARIANTES_IDENTITE,
  lireNomIdentite,
} from "@ssk-it/canon-check/identite";
export type { NomIdentite } from "@ssk-it/canon-check/identite";

export type VarianteIdentite = (typeof VARIANTES_IDENTITE)[number];
export type FormatIdentite = (typeof FORMATS_IDENTITE)[number];

/**
 * Les fichiers qui peuvent porter le symbole sur un fond, du meilleur au
 * moins bon.
 *
 * La variante de l'autre fond n'y figure pas : un symbole clair sur fond
 * sombre peut disparaître, et l'avatar de l'organisation vaut mieux qu'une
 * identité illisible (RG-identite-affichee).
 */
export function listCandidatsSymbole(variante: VarianteIdentite): string[] {
  return [`symbole-${variante}`, "symbole"].flatMap((base) =>
    FORMATS_IDENTITE.map((format) => `${base}.${format}`),
  );
}

/**
 * Un fichier de `identite/`, chemin relatif au répertoire, tel que
 * l'arborescence de la plateforme le donne — avec son empreinte, que la
 * vérification n'a pas à connaître. Distinct du `FichierIdentite` de la
 * bibliothèque (`chemin`, `taille`), qui décrit ce qu'elle contrôle.
 */
export interface FichierIdentite {
  readonly path: string;
  readonly sha: string;
  readonly size?: number;
}

/**
 * Le fichier à montrer comme symbole sur ce fond, parmi ceux que le
 * répertoire contient.
 *
 * Un fichier au-delà de la borne est écarté : la vérification le refuse, et
 * le télécharger ferait payer à l'accueil le poids qu'elle existe pour éviter.
 */
export function chooseSymbole<F extends FichierIdentite>(
  fichiers: readonly F[],
  variante: VarianteIdentite,
): F | null {
  for (const nom of listCandidatsSymbole(variante)) {
    const f = fichiers.find((x) => x.path === nom);
    if (f && (f.size ?? 0) <= POIDS_MAX_IDENTITE) return f;
  }
  return null;
}

const TYPES: Record<FormatIdentite, string> = {
  svg: "image/svg+xml",
  webp: "image/webp",
  png: "image/png",
};

/**
 * Le type d'image d'un fichier, d'après son nom.
 *
 * Le canal non décompté sert tout en `text/plain` : sans un type déclaré,
 * l'image ne s'afficherait pas.
 */
export function formatTypeImage(chemin: string): string | null {
  const nom = lireNomIdentite(chemin);
  return nom ? TYPES[nom.format] : null;
}
