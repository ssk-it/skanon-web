import {
  FORMATS_IDENTITE,
  POIDS_MAX_IDENTITE,
  VARIANTES_IDENTITE,
  lireNomIdentite,
} from "@ssk-it/canon-check/identite";

/**
 * The names of a project's identity are rules of the format: they come
 * from the library the check also applies (RG-parseur-partage).
 * Keeping them here separately would make the two lists diverge, and a file the
 * check accepts would not display. All that remains specific to the application
 * is the choice of the file to show depending on the background (RG-identite-affichee).
 */
export {
  FORMATS_IDENTITE,
  POIDS_MAX_IDENTITE,
  REPERTOIRE_IDENTITE,
  VARIANTES_IDENTITE,
  lireNomIdentite,
} from "@ssk-it/canon-check/identite";
export type { NomIdentite } from "@ssk-it/canon-check/identite";

export type IdentityVariant = (typeof VARIANTES_IDENTITE)[number];
export type IdentityFormat = (typeof FORMATS_IDENTITE)[number];

/**
 * The files that can carry the symbol on a background, from best to
 * worst.
 *
 * The other background's variant is not among them: a light symbol on a dark
 * background can disappear, and the organization's avatar is better than an
 * unreadable identity (RG-identite-affichee).
 */
export function listSymbolCandidates(variant: IdentityVariant): string[] {
  return [`symbole-${variant}`, "symbole"].flatMap((base) =>
    FORMATS_IDENTITE.map((format) => `${base}.${format}`),
  );
}

/**
 * A file of `identite/`, path relative to the directory, as the
 * platform's tree gives it — with its fingerprint, which the
 * check does not need to know. Distinct from the library's `FichierIdentite`
 * (`chemin`, `taille`), which describes what it checks.
 */
export interface IdentityFile {
  readonly path: string;
  readonly sha: string;
  readonly size?: number;
}

/**
 * The file to show as the symbol on this background, among those the
 * directory contains.
 *
 * A file beyond the limit is set aside: the check refuses it, and
 * downloading it would make the home page pay the weight the limit exists to avoid.
 */
export function chooseSymbol<F extends IdentityFile>(
  files: readonly F[],
  variant: IdentityVariant,
): F | null {
  for (const name of listSymbolCandidates(variant)) {
    const f = files.find((x) => x.path === name);
    if (f && (f.size ?? 0) <= POIDS_MAX_IDENTITE) return f;
  }
  return null;
}

const TYPES: Record<IdentityFormat, string> = {
  svg: "image/svg+xml",
  webp: "image/webp",
  png: "image/png",
};

/**
 * The image type of a file, from its name.
 *
 * The uncounted channel serves everything as `text/plain`: without a declared type,
 * the image would not display.
 */
export function formatImageType(path: string): string | null {
  const name = lireNomIdentite(path);
  return name ? TYPES[name.format] : null;
}
