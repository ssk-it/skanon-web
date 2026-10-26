import { Cadrage, Decision, Referentiel } from "../model/model";
import { afficherIdentifiant } from "./reference-cadrage";

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
export type NatureResultat = "regle" | "decision" | "architecture" | "cadrage";

export const NATURES_RESULTAT: readonly NatureResultat[] = [
  "regle",
  "decision",
  "architecture",
  "cadrage",
];

export interface ResultatRecherche {
  readonly nature: NatureResultat;
  /** L'identifiant stocké — celui d'une décision de cadrage est préfixé du cadrage. */
  readonly id: string;
  /** L'identifiant tel qu'il se donne à lire — RG-prefixe-projet. */
  readonly identifiant: string;
  /** Vide pour une règle ou un document, qui n'ont que leur identifiant et leur énoncé. */
  readonly titre: string;
  readonly extrait: string;
  /** Les segments de la vue, sous le dépôt ouvert — voir `LiensService.vers`. */
  readonly lien: readonly string[];
  /** L'ancre où l'élément se trouve dans sa vue, quand il n'en a pas une à lui. */
  readonly ancre: string | null;
  /** Vrai pour ce qui vit sur une branche, et n'appartient pas encore au référentiel. */
  readonly enCours: boolean;
  /** La demande de fusion d'un résultat en cours, quand elle est connue. */
  readonly pullRequest: number | null;
}

interface EntreeIndex extends Omit<ResultatRecherche, "extrait"> {
  /** Le corps débarrassé de son balisage, d'où l'extrait est tiré. */
  readonly corps: string;
  readonly cleIdentifiant: string;
  readonly cleTitre: string;
  readonly cleCorps: string;
}

export interface IndexRecherche {
  readonly entrees: readonly EntreeIndex[];
}

export interface ResultatsRecherche {
  /** Ce que le référentiel porte, classé par pertinence. */
  readonly referentiel: readonly ResultatRecherche[];
  /** Ce qui vit sur une branche, présenté à part — RG-cadrages-ouverts-visibles. */
  readonly enCours: readonly ResultatRecherche[];
}

const MARQUES_DIACRITIQUES = /[̀-ͯ]/g;

/**
 * Minuscules et sans accents, **à longueur égale**.
 *
 * La correspondance est cherchée dans le texte normalisé, mais l'extrait est
 * découpé dans le texte d'origine : les deux doivent garder les mêmes positions,
 * ce qu'une normalisation de la chaîne entière ne garantit pas.
 */
function normaliser(texte: string): string {
  let out = "";
  for (const c of texte) {
    const n = c
      .normalize("NFD")
      .replace(MARQUES_DIACRITIQUES, "")
      .toLowerCase();
    // un caractère hors du plan de base occupe deux unités : on les rend toutes
    out += n.length === c.length ? n : (n + c).slice(0, c.length);
  }
  return out;
}

/** Le texte à lire, sans le balisage Markdown qui gênerait l'extrait. */
function toTexteBrut(markdown: string): string {
  return markdown
    .replace(/```[\s\S]*?```/g, " ")
    .replace(/!?\[([^\]]*)\]\([^)]*\)/g, "$1")
    .replace(/^\s{0,3}(#{1,6}|>|[-*+]|\d+\.)\s+/gm, "")
    .replace(/\*\*|__|`/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

function entree(
  base: Omit<EntreeIndex, "corps" | "cleIdentifiant" | "cleTitre" | "cleCorps">,
  markdown: string,
): EntreeIndex {
  const corps = toTexteBrut(markdown);
  return {
    ...base,
    corps,
    cleIdentifiant: normaliser(`${base.id} ${base.identifiant}`),
    cleTitre: normaliser(base.titre),
    cleCorps: normaliser(corps),
  };
}

function corpsDecision(d: Decision): string {
  return [
    d.description,
    ...d.options.map((o) => `${o.titre} — ${o.corps}`),
  ].join("\n\n");
}

function corpsCadrage(c: Cadrage): string {
  return [
    c.objectif,
    c.parcours,
    ...c.enonces.values(),
    ...c.divers.flatMap((s) => [s.titre, s.corps]),
  ].join("\n\n");
}

/**
 * Un cadrage est en cours tant qu'il vit sur sa branche.
 *
 * La provenance le dit ; le statut le redit pour un cadrage construit sans
 * elle. L'un ou l'autre suffit à le tenir hors du référentiel.
 */
function isEnCours(c: Cadrage): boolean {
  return c.provenance !== undefined || c.statut !== "livree";
}

export function buildIndexRecherche(ref: Referentiel): IndexRecherche {
  const entrees: EntreeIndex[] = [];
  const sansCadrage = {
    titre: "",
    ancre: null,
    enCours: false,
    pullRequest: null,
  };

  for (const r of ref.regles.values()) {
    entrees.push(
      entree(
        {
          ...sansCadrage,
          nature: "regle",
          id: r.id,
          identifiant: r.id,
          lien: ["referentiel", "regle", r.id],
        },
        r.enonce,
      ),
    );
  }
  for (const d of ref.decisions.values()) {
    entrees.push(
      entree(
        {
          ...sansCadrage,
          nature: "decision",
          id: d.id,
          identifiant: d.id,
          lien: ["architecture", "decision", d.id],
        },
        d.enonce,
      ),
    );
  }
  for (const d of ref.architecture.values()) {
    entrees.push(
      entree(
        {
          ...sansCadrage,
          nature: "architecture",
          id: d.id,
          identifiant: d.id,
          lien: ["architecture", "document", d.id],
        },
        d.enonce,
      ),
    );
  }

  const prefixe = ref.projet.prefixe;
  for (const c of ref.cadrages.values()) {
    const identifiant = afficherIdentifiant(c.id, prefixe);
    const lien = ["cadrages", c.id];
    const enCours = isEnCours(c);
    const pullRequest = c.provenance?.pullRequest ?? null;

    entrees.push(
      entree(
        {
          nature: "cadrage",
          id: c.id,
          identifiant,
          titre: c.titre,
          lien,
          ancre: null,
          enCours,
          pullRequest,
        },
        corpsCadrage(c),
      ),
    );
    // Une décision de cadrage n'a pas de vue à elle : elle se lit dans son
    // cadrage, à son ancre, et suit le sort du cadrage — en cours avec lui.
    for (const d of c.decisions) {
      entrees.push(
        entree(
          {
            nature: "decision",
            id: `${c.id}/${d.id}`,
            identifiant: `${identifiant} · ${d.id}`,
            titre: d.titre,
            lien,
            ancre: `decision-${d.id}`,
            enCours,
            pullRequest,
          },
          corpsDecision(d),
        ),
      );
    }
  }

  return { entrees };
}

/** Avant et après la correspondance, en caractères : de quoi la situer. */
const AVANT = 50;
const APRES = 90;

function toExtrait(e: EntreeIndex, termes: readonly string[]): string {
  const positions = termes
    .map((t) => e.cleCorps.indexOf(t))
    .filter((p) => p >= 0);
  const position = positions.length ? Math.min(...positions) : 0;

  let debut = Math.max(0, position - AVANT);
  let fin = Math.min(e.corps.length, position + APRES);
  // On coupe entre deux mots, jamais au milieu d'un.
  if (debut > 0) debut = e.corps.indexOf(" ", debut) + 1 || debut;
  if (fin < e.corps.length)
    fin =
      e.corps.lastIndexOf(" ", fin) > debut
        ? e.corps.lastIndexOf(" ", fin)
        : fin;

  return `${debut > 0 ? "… " : ""}${e.corps.slice(debut, fin).trim()}${fin < e.corps.length ? " …" : ""}`;
}

/**
 * Le poids d'une entrée pour une requête, ou 0 si un terme y manque.
 *
 * Chaque terme doit apparaître quelque part : une recherche à deux mots en
 * précise une à un mot, elle ne l'élargit pas. Un terme trouvé dans
 * l'identifiant pèse plus que dans le titre, qui pèse plus que dans le corps —
 * qui tape un identifiant sait ce qu'il cherche.
 */
function score(e: EntreeIndex, termes: readonly string[]): number {
  let total = 0;
  for (const t of termes) {
    if (e.cleIdentifiant.includes(t)) total += 3;
    else if (e.cleTitre.includes(t)) total += 2;
    else if (e.cleCorps.includes(t)) total += 1;
    else return 0;
  }
  return total;
}

export function findResultats(
  index: IndexRecherche,
  requete: string,
): ResultatsRecherche {
  const termes = normaliser(requete).split(/\s+/).filter(Boolean);
  if (!termes.length) return { referentiel: [], enCours: [] };

  const trouves = index.entrees
    .map((e) => ({ e, poids: score(e, termes) }))
    .filter((x) => x.poids > 0)
    // le tri est stable : à poids égal, l'ordre de l'index est conservé
    .sort((a, b) => b.poids - a.poids)
    .map(({ e }): ResultatRecherche => {
      const { corps, cleIdentifiant, cleTitre, cleCorps, ...resultat } = e;
      return { ...resultat, extrait: toExtrait(e, termes) };
    });

  return {
    referentiel: trouves.filter((r) => !r.enCours),
    enCours: trouves.filter((r) => r.enCours),
  };
}
