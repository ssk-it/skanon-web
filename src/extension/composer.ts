import { InjectionToken } from "../core/injection";
import type {
  Composition,
  Contribution,
  Extension,
  HelpSection,
} from "./extension";

/**
 * Rassemble les extensions d'un livrable, point par point. Lève sur une composition fausse — deux extensions ou deux apports d'un même point de même identifiant, deux hébergeurs — : elle échoue au premier test, non chez l'utilisateur.
 */
export function compose(extensions: readonly Extension[]): Composition {
  unique(
    extensions.map((e) => e.id),
    "extension",
  );

  const hosts = extensions.flatMap((e) =>
    e.pages?.legalNotice?.host ? [e.pages.legalNotice.host] : [],
  );
  if (hosts.length > 1)
    throw new Error(
      `Un livrable n'a qu'un hébergeur, ${hosts.length} sont apportés`,
    );

  return {
    toolbarActions: sortByRank(
      extensions.flatMap((e) => e.shell?.toolbarActions ?? []),
      "action de barre",
    ),
    banners: sortByRank(
      extensions.flatMap((e) => e.shell?.banners ?? []),
      "bandeau",
    ),
    help: {
      jetons: phrases(extensions, "jetons"),
      cache: phrases(extensions, "cache"),
      communications: phrases(extensions, "communications"),
    },
    legalNotice: {
      host: hosts[0] ?? null,
      data: extensions.flatMap((e) => e.pages?.legalNotice?.data ?? []),
      ownership: extensions.flatMap(
        (e) => e.pages?.legalNotice?.ownership ?? [],
      ),
    },
  };
}

function phrases(
  extensions: readonly Extension[],
  section: HelpSection,
): readonly string[] {
  return extensions.flatMap((e) => e.pages?.help?.[section] ?? []);
}

function unique(ids: readonly string[], kind: string): void {
  const seen = new Set<string>();
  for (const id of ids) {
    if (seen.has(id))
      throw new Error(`Deux apports « ${kind} » portent l'identifiant ${id}`);
    seen.add(id);
  }
}

/** Par rang, puis dans l'ordre de composition : le tri de JavaScript est stable. */
function sortByRank<T extends Contribution>(
  contributions: readonly T[],
  kind: string,
): readonly T[] {
  unique(
    contributions.map((a) => a.id),
    kind,
  );
  return [...contributions].sort((a, b) => (a.rank ?? 0) - (b.rank ?? 0));
}

/** Les apports du livrable, que la racine de composition fournit. Sans elle — dans les tests —, aucun. */
export const COMPOSITION = new InjectionToken<Composition>("COMPOSITION", {
  factory: () => compose([]),
});
