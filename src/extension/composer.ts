import type { Localized } from "../core/i18n/language";
import { InjectionToken } from "../core/injection";
import type {
  Composition,
  Contribution,
  Extension,
  HelpSection,
} from "./extension";

/**
 * Gathers a deliverable's extensions, point by point. Throws on a wrong composition — two extensions, or two contributions to the same point, with the same identifier, two hosts —: it fails at the first test, not at the user's.
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
): readonly Localized<string>[] {
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

/** By rank, then in composition order: JavaScript's sort is stable. */
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

/** The deliverable's contributions, which the composition root provides. Without it — in tests —, none. */
export const COMPOSITION = new InjectionToken<Composition>("COMPOSITION", {
  factory: () => compose([]),
});
