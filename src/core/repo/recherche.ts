import { Scoping, Decision, Specification } from "../model/model";
import { displayIdentifier } from "./reference-cadrage";

/**
 * La recherche dans le référentiel — RG-index-recherche-client,
 * RG-recherche-perimetre, RG-recherche-en-cours-a-part.
 *
 * L'index est une fonction pure du référentiel en mémoire, cadrages lus sur les
 * branches compris : il ne reçoit rien d'autre, et ne peut donc coûter aucun
 * appel. Il se reconstruit quand le référentiel change — après une écriture, ou
 * quand les branches finissent d'arriver — au lieu d'être tenu à jour : un index
 * maintenu à côté serait une seconde source qui finirait par diverger
 * (2026-001, décision 01).
 */

/** Les natures que la recherche distingue, dans l'ordre où elles s'affichent. */
export type ResultKind = "regle" | "decision" | "architecture" | "cadrage";

export const RESULT_KINDS: readonly ResultKind[] = [
  "regle",
  "decision",
  "architecture",
  "cadrage",
];

export interface SearchResult {
  readonly kind: ResultKind;
  /** L'identifiant stocké — celui d'une décision de cadrage est préfixé du cadrage. */
  readonly id: string;
  /** L'identifiant tel qu'il se donne à lire — RG-prefixe-projet. */
  readonly identifier: string;
  /** Vide pour une règle ou un document, qui n'ont que leur identifiant et leur énoncé. */
  readonly title: string;
  readonly excerpt: string;
  /** Les segments de la vue, sous le dépôt ouvert — voir `LiensService.vers`. */
  readonly link: readonly string[];
  /** L'ancre où l'élément se trouve dans sa vue, quand il n'en a pas une à lui. */
  readonly anchor: string | null;
  /** Vrai pour ce qui vit sur une branche, et n'appartient pas encore au référentiel. */
  readonly inProgress: boolean;
  /** La demande de fusion d'un résultat en cours, quand elle est connue. */
  readonly pullRequest: number | null;
}

interface IndexEntry extends Omit<SearchResult, "excerpt"> {
  /** Le corps débarrassé de son balisage, d'où l'extrait est tiré. */
  readonly body: string;
  readonly identifierKey: string;
  readonly titleKey: string;
  readonly bodyKey: string;
}

export interface SearchIndex {
  readonly entries: readonly IndexEntry[];
}

export interface SearchResults {
  /** Ce que le référentiel porte, classé par pertinence. */
  readonly specification: readonly SearchResult[];
  /** Ce qui vit sur une branche, présenté à part — RG-cadrages-ouverts-visibles. */
  readonly inProgress: readonly SearchResult[];
}

const DIACRITIC_MARKS = /[̀-ͯ]/g;

/**
 * Minuscules et sans accents, **à longueur égale**.
 *
 * La correspondance est cherchée dans le texte normalisé, mais l'extrait est
 * découpé dans le texte d'origine : les deux doivent garder les mêmes positions,
 * ce qu'une normalisation de la chaîne entière ne garantit pas.
 */
function normalize(text: string): string {
  let out = "";
  for (const c of text) {
    const n = c.normalize("NFD").replace(DIACRITIC_MARKS, "").toLowerCase();
    // un caractère hors du plan de base occupe deux unités : on les rend toutes
    out += n.length === c.length ? n : (n + c).slice(0, c.length);
  }
  return out;
}

/** Le texte à lire, sans le balisage Markdown qui gênerait l'extrait. */
function toPlainText(markdown: string): string {
  return markdown
    .replace(/```[\s\S]*?```/g, " ")
    .replace(/!?\[([^\]]*)\]\([^)]*\)/g, "$1")
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
 * Un cadrage est en cours tant qu'il vit sur sa branche.
 *
 * La provenance le dit ; le statut le redit pour un cadrage construit sans
 * elle. L'un ou l'autre suffit à le tenir hors du référentiel.
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
    // Une décision de cadrage n'a pas de vue à elle : elle se lit dans son
    // cadrage, à son ancre, et suit le sort du cadrage — en cours avec lui.
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

/** Avant et après la correspondance, en caractères : de quoi la situer. */
const BEFORE = 50;
const AFTER = 90;

function toExcerpt(e: IndexEntry, terms: readonly string[]): string {
  const positions = terms
    .map((t) => e.bodyKey.indexOf(t))
    .filter((p) => p >= 0);
  const position = positions.length ? Math.min(...positions) : 0;

  let begin = Math.max(0, position - BEFORE);
  let end = Math.min(e.body.length, position + AFTER);
  // On coupe entre deux mots, jamais au milieu d'un.
  if (begin > 0) begin = e.body.indexOf(" ", begin) + 1 || begin;
  if (end < e.body.length)
    end =
      e.body.lastIndexOf(" ", end) > begin ? e.body.lastIndexOf(" ", end) : end;

  return `${begin > 0 ? "… " : ""}${e.body.slice(begin, end).trim()}${end < e.body.length ? " …" : ""}`;
}

/**
 * Le poids d'une entrée pour une requête, ou 0 si un terme y manque.
 *
 * Chaque terme doit apparaître quelque part : une recherche à deux mots en
 * précise une à un mot, elle ne l'élargit pas. Un terme trouvé dans
 * l'identifiant pèse plus que dans le titre, qui pèse plus que dans le corps —
 * qui tape un identifiant sait ce qu'il cherche.
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
    // le tri est stable : à poids égal, l'ordre de l'index est conservé
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
