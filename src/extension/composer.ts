import { InjectionToken } from "../core/injection";
import type {
  Composition,
  Contribution,
  Extension,
  SectionAide,
} from "./extension";

/**
 * Rassemble les extensions d'un livrable, point par point. Lève sur une composition fausse — deux extensions ou deux apports d'un même point de même identifiant, deux hébergeurs — : elle échoue au premier test, non chez l'utilisateur.
 */
export function composer(extensions: readonly Extension[]): Composition {
  unique(
    extensions.map((e) => e.id),
    "extension",
  );

  const hebergeurs = extensions.flatMap((e) =>
    e.pages?.mentions?.hebergeur ? [e.pages.mentions.hebergeur] : [],
  );
  if (hebergeurs.length > 1)
    throw new Error(
      `Un livrable n'a qu'un hébergeur, ${hebergeurs.length} sont apportés`,
    );

  return {
    actionsDeBarre: ranger(
      extensions.flatMap((e) => e.coquille?.actionsDeBarre ?? []),
      "action de barre",
    ),
    bandeaux: ranger(
      extensions.flatMap((e) => e.coquille?.bandeaux ?? []),
      "bandeau",
    ),
    aide: {
      jetons: phrases(extensions, "jetons"),
      cache: phrases(extensions, "cache"),
      communications: phrases(extensions, "communications"),
    },
    mentions: {
      hebergeur: hebergeurs[0] ?? null,
      donnees: extensions.flatMap((e) => e.pages?.mentions?.donnees ?? []),
      propriete: extensions.flatMap((e) => e.pages?.mentions?.propriete ?? []),
    },
  };
}

function phrases(
  extensions: readonly Extension[],
  section: SectionAide,
): readonly string[] {
  return extensions.flatMap((e) => e.pages?.aide?.[section] ?? []);
}

function unique(ids: readonly string[], nature: string): void {
  const vus = new Set<string>();
  for (const id of ids) {
    if (vus.has(id))
      throw new Error(`Deux apports « ${nature} » portent l'identifiant ${id}`);
    vus.add(id);
  }
}

/** Par rang, puis dans l'ordre de composition : le tri de JavaScript est stable. */
function ranger<T extends Contribution>(
  apports: readonly T[],
  nature: string,
): readonly T[] {
  unique(
    apports.map((a) => a.id),
    nature,
  );
  return [...apports].sort((a, b) => (a.rang ?? 0) - (b.rang ?? 0));
}

/** Les apports du livrable, que la racine de composition fournit. Sans elle — dans les tests —, aucun. */
export const COMPOSITION = new InjectionToken<Composition>("COMPOSITION", {
  factory: () => composer([]),
});
