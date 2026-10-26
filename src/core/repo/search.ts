import { Scoping, Decision, Specification } from "../model/model";
import { displayIdentifier } from "./scoping-reference";

/**
 * Search in the specification — RG-index-recherche-client,
 * RG-recherche-perimetre, RG-recherche-en-cours-a-part.
 *
 * The index is a pure function of the in-memory specification, scopings read
 * on branches included: it receives nothing else, and so can cost no call. It
 * is rebuilt when the specification changes — after a write, or when branches
 * finish arriving — instead of being kept up to date: an index maintained
 * alongside would be a second source that would end up diverging
 * (2026-001, decision 01).
 */

/** The kinds search distinguishes, in the order they are displayed. */
export type ResultKind = "regle" | "decision" | "architecture" | "cadrage";

export const RESULT_KINDS: readonly ResultKind[] = [
  "regle",
  "decision",
  "architecture",
  "cadrage",
];

export interface SearchResult {
  readonly kind: ResultKind;
  /** The stored identifier — a scoping decision's is prefixed with the scoping's. */
  readonly id: string;
  /** The identifier as it is given to read — RG-prefixe-projet. */
  readonly identifier: string;
  /** Empty for a rule or a document, which have only their identifier and their statement. */
  readonly title: string;
  readonly excerpt: string;
  /** The view's segments, under the open repo — see `LinksService.to`. */
  readonly link: readonly string[];
  /** The anchor where the item sits in its view, when it has none of its own. */
  readonly anchor: string | null;
  /** True for what lives on a branch, and does not yet belong to the specification. */
  readonly inProgress: boolean;
  /** The pull request of an in-progress result, when it is known. */
  readonly pullRequest: number | null;
}

interface IndexEntry extends Omit<SearchResult, "excerpt"> {
  /** The body stripped of its markup, from which the excerpt is taken. */
  readonly body: string;
  readonly identifierKey: string;
  readonly titleKey: string;
  readonly bodyKey: string;
}

export interface SearchIndex {
  readonly entries: readonly IndexEntry[];
}

export interface SearchResults {
  /** What the specification carries, ranked by relevance. */
  readonly specification: readonly SearchResult[];
  /** What lives on a branch, presented apart — RG-cadrages-ouverts-visibles. */
  readonly inProgress: readonly SearchResult[];
}

const DIACRITIC_MARKS = /[̀-ͯ]/g;

/**
 * Lowercase and without accents, **at equal length**.
 *
 * The match is searched in the normalised text, but the excerpt is cut from
 * the original text: both must keep the same positions, which normalising the
 * whole string does not guarantee.
 */
function normalize(text: string): string {
  let out = "";
  for (const c of text) {
    const n = c.normalize("NFD").replace(DIACRITIC_MARKS, "").toLowerCase();
    // a character outside the basic plane takes two units: all of them are returned
    out += n.length === c.length ? n : (n + c).slice(0, c.length);
  }
  return out;
}

/** The text to read, without the Markdown markup that would hinder the excerpt. */
function toPlainText(markdown: string): string {
  return markdown
    .replace(/```[\s\S]*?```/g, " ")
    .replace(/!?\[([^[\]]*)\]\([^)]*\)/g, "$1")
    .replace(/^\s{0,3}(#{1,6}|>|[-*+]|\d+\.)\s+/gm, "")
    .replace(/\*\*|__|`/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

function entry(
  base: Omit<IndexEntry, "body" | "identifierKey" | "titleKey" | "bodyKey">,
  markdown: string,
): IndexEntry {
  const body = toPlainText(markdown);
  return {
    ...base,
    body,
    identifierKey: normalize(`${base.id} ${base.identifier}`),
    titleKey: normalize(base.title),
    bodyKey: normalize(body),
  };
}

function decisionBody(d: Decision): string {
  return [
    d.description,
    ...d.options.map((o) => `${o.title} — ${o.body}`),
  ].join("\n\n");
}

function scopingBody(c: Scoping): string {
  return [
    c.goal,
    c.journey,
    ...c.statements.values(),
    ...c.misc.flatMap((s) => [s.title, s.body]),
  ].join("\n\n");
}

/**
 * A scoping is in progress as long as it lives on its branch.
 *
 * The provenance says so; the status says it again for a scoping built
 * without one. Either is enough to keep it out of the specification.
 */
function isInProgress(c: Scoping): boolean {
  return c.provenance !== undefined || c.status !== "livree";
}

export function buildSearchIndex(ref: Specification): SearchIndex {
  const entries: IndexEntry[] = [];
  const withoutScoping = {
    title: "",
    anchor: null,
    inProgress: false,
    pullRequest: null,
  };

  for (const r of ref.rules.values()) {
    entries.push(
      entry(
        {
          ...withoutScoping,
          kind: "regle",
          id: r.id,
          identifier: r.id,
          link: ["referentiel", "regle", r.id],
        },
        r.statement,
      ),
    );
  }
  for (const d of ref.decisions.values()) {
    entries.push(
      entry(
        {
          ...withoutScoping,
          kind: "decision",
          id: d.id,
          identifier: d.id,
          link: ["architecture", "decision", d.id],
        },
        d.statement,
      ),
    );
  }
  for (const d of ref.architecture.values()) {
    entries.push(
      entry(
        {
          ...withoutScoping,
          kind: "architecture",
          id: d.id,
          identifier: d.id,
          link: ["architecture", "document", d.id],
        },
        d.statement,
      ),
    );
  }

  const prefix = ref.project.prefix;
  for (const c of ref.scopings.values()) {
    const identifier = displayIdentifier(c.id, prefix);
    const link = ["cadrages", c.id];
    const inProgress = isInProgress(c);
    const pullRequest = c.provenance?.pullRequest ?? null;

    entries.push(
      entry(
        {
          kind: "cadrage",
          id: c.id,
          identifier,
          title: c.title,
          link,
          anchor: null,
          inProgress,
          pullRequest,
        },
        scopingBody(c),
      ),
    );
    // A scoping decision has no view of its own: it is read in its scoping, at
    // its anchor, and follows the scoping's fate — in progress with it.
    for (const d of c.decisions) {
      entries.push(
        entry(
          {
            kind: "decision",
            id: `${c.id}/${d.id}`,
            identifier: `${identifier} · ${d.id}`,
            title: d.title,
            link,
            anchor: `decision-${d.id}`,
            inProgress,
            pullRequest,
          },
          decisionBody(d),
        ),
      );
    }
  }

  return { entries };
}

/** Before and after the match, in characters: enough to place it. */
const BEFORE = 50;
const AFTER = 90;

function toExcerpt(e: IndexEntry, terms: readonly string[]): string {
  const positions = terms
    .map((t) => e.bodyKey.indexOf(t))
    .filter((p) => p >= 0);
  const position = positions.length ? Math.min(...positions) : 0;

  let begin = Math.max(0, position - BEFORE);
  let end = Math.min(e.body.length, position + AFTER);
  // Cut between two words, never in the middle of one.
  if (begin > 0) begin = e.body.indexOf(" ", begin) + 1 || begin;
  if (end < e.body.length)
    end =
      e.body.lastIndexOf(" ", end) > begin ? e.body.lastIndexOf(" ", end) : end;

  return `${begin > 0 ? "… " : ""}${e.body.slice(begin, end).trim()}${end < e.body.length ? " …" : ""}`;
}

/**
 * The weight of an entry for a query, or 0 if a term is missing from it.
 *
 * Each term must appear somewhere: a two-word search narrows a one-word one,
 * it does not widen it. A term found in the identifier weighs more than in the
 * title, which weighs more than in the body — whoever types an identifier
 * knows what they are looking for.
 */
function score(e: IndexEntry, terms: readonly string[]): number {
  let total = 0;
  for (const t of terms) {
    if (e.identifierKey.includes(t)) total += 3;
    else if (e.titleKey.includes(t)) total += 2;
    else if (e.bodyKey.includes(t)) total += 1;
    else return 0;
  }
  return total;
}

export function findResults(index: SearchIndex, query: string): SearchResults {
  const terms = normalize(query).split(/\s+/).filter(Boolean);
  if (!terms.length) return { specification: [], inProgress: [] };

  const found = index.entries
    .map((e) => ({ e, weight: score(e, terms) }))
    .filter((x) => x.weight > 0)
    // the sort is stable: at equal weight, the index order is kept
    .sort((a, b) => b.weight - a.weight)
    .map(({ e }): SearchResult => {
      const { body, identifierKey, titleKey, bodyKey, ...result } = e;
      return { ...result, excerpt: toExcerpt(e, terms) };
    });

  return {
    specification: found.filter((r) => !r.inProgress),
    inProgress: found.filter((r) => r.inProgress),
  };
}
