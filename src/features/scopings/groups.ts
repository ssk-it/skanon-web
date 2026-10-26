import type { Language } from "../../core/i18n/language";
import type { Scoping } from "../../core/model/model";
import { displayIdentifier } from "../../core/repo/scoping-reference";
import { groupsMessages } from "./groups.messages";

/**
 * A block of the list: the scopings in progress, or a delivery quarter.
 *
 * `key` serves the template's `track` and must therefore stay stable as long as
 * the group exists; `label` is what is displayed.
 */
export interface ScopingGroup {
  readonly key: string;
  readonly label: string;
  readonly scopings: readonly Scoping[];
}

/**
 * The quarter of an ISO date, in the form `2026-T3`.
 *
 * Read in UTC, as Git produces it. In local time, a scoping delivered on the
 * evening of 31 March moves to the next quarter for a reader east of Greenwich
 * and not for the others: the same repo would be divided differently depending
 * on the time zone of whoever looks at it.
 */
export function quarterOf(iso: string): string {
  const d = new Date(iso);
  return `${d.getUTCFullYear()}-T${Math.floor(d.getUTCMonth() / 3) + 1}`;
}

function quarterLabel(key: string, language: Language): string {
  const [year, t] = key.split("-T");
  return groupsMessages[language].quarter(t, year);
}

/**
 * Cuts the list into blocks: work in progress first, then the scopings
 * delivered by quarter, from most recent to oldest.
 *
 * **Why the in-progress ones escape the quarters.** The list is ordered by
 * status before being ordered by date. Cutting that order by quarter would bring
 * the same quarter back in several places — recent drafts at the top, then the
 * delivered ones going back in time. The in-progress ones therefore form a
 * separate block, and the chronological division applies only below, where the
 * order is actually descending.
 *
 * Dates arrive after the list, one Git call per scoping. A scoping whose date
 * is still missing joins a « sans date » group at the end of the list rather
 * than disappearing: better to show it misplaced than not at all.
 *
 * The labels are in the displayed language; the keys are not, since they
 * identify a group across a language switch.
 */
export function groupScopings(
  scopings: readonly Scoping[],
  dateOf: (id: string) => string | null | undefined,
  language: Language,
): readonly ScopingGroup[] {
  const t = groupsMessages[language];
  const inProgress = scopings.filter((c) => c.status !== "livree");
  const delivered = scopings.filter((c) => c.status === "livree");

  const groups: ScopingGroup[] = [];
  if (inProgress.length) {
    groups.push({ key: "en-cours", label: t.inProgress, scopings: inProgress });
  }

  // A Map keeps insertion order: since delivered ones already arrive from most
  // recent to oldest, the quarters follow one another without re-sorting.
  const byQuarter = new Map<string, Scoping[]>();
  const undated: Scoping[] = [];
  for (const c of delivered) {
    const date = dateOf(c.id);
    if (!date) {
      undated.push(c);
      continue;
    }
    const key = quarterOf(date);
    const already = byQuarter.get(key);
    if (already) already.push(c);
    else byQuarter.set(key, [c]);
  }

  // No dated delivered one: cutting would make no sense, and a « Pas encore
  // daté » header topping the whole list would pass for a category of scopings —
  // RG-liste-cadrages-sobre. The why is said once, separately: see
  // `deliveredDatesState`.
  if (!byQuarter.size) {
    if (undated.length)
      groups.push({ key: "livres", label: t.delivered, scopings: undated });
    return groups;
  }

  for (const [key, members] of byQuarter) {
    groups.push({ key, label: quarterLabel(key, language), scopings: members });
  }
  if (undated.length) {
    // « Pas encore daté » and not « Date inconnue »: the common case is not
    // an anomaly but a scoping still living on its branch, with no delivery
    // date on the main one. The second case, a date slow to
    // arrive, resolves itself on the next load.
    groups.push({
      key: "sans-date",
      label: t.undated,
      scopings: undated,
    });
  }
  return groups;
}

/**
 * Where the dates of delivered scopings stand.
 *
 * `chargement` while some remain to be read; `indisponibles` when none could
 * be — the list then says so once, with its cause; `lues` as soon as one date
 * is known, or when nothing is delivered.
 */
export function deliveredDatesState(
  scopings: readonly Scoping[],
  dateOf: (id: string) => string | null | undefined,
): "chargement" | "indisponibles" | "lues" {
  const delivered = scopings.filter((c) => c.status === "livree");
  if (!delivered.length) return "lues";
  const dates = delivered.map((c) => dateOf(c.id));
  if (dates.some((d) => typeof d === "string")) return "lues";
  return dates.some((d) => d === undefined) ? "chargement" : "indisponibles";
}

/** Lowercase, without accents: « Pièces » is found by typing « pieces ». */
function normalize(text: string): string {
  return text
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase();
}

/**
 * The scopings that match the filter, in the order received —
 * RG-liste-cadrages-filtrable.
 *
 * The text applies to the identifier, as stored and as displayed, and to the
 * title. Domains add up: a scoping is kept if it has one among those chosen.
 * Filtering before grouping keeps the life-cycle order and the separation of
 * scopings in progress.
 */
export function filterScopings(
  scopings: readonly Scoping[],
  text: string,
  domains: ReadonlySet<string>,
  prefix: string | null,
): readonly Scoping[] {
  const terms = normalize(text).split(/\s+/).filter(Boolean);
  return scopings.filter((c) => {
    if (domains.size && !c.domains.some((d) => domains.has(d))) return false;
    if (!terms.length) return true;
    const target = normalize(
      `${c.id} ${displayIdentifier(c.id, prefix)} ${c.title}`,
    );
    return terms.every((t) => target.includes(t));
  });
}
