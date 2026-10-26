import { load } from "js-yaml";
import { SectionDivers } from "../model/model";

/**
 * Découpage frontmatter / corps.
 *
 * `gray-matter` n'est volontairement pas utilisé : c'est un paquet Node qui tire
 * des dépendances serveur et se comporte mal dans un navigateur. Le découpage
 * tient en une expression régulière.
 *
 * Cette logique existe en double, ici et dans `actions/src/parse.mjs`. Les deux
 * doivent rester d'accord — voir RG-parseur-partage. Toute modification ici doit
 * être reportée là-bas, et le dépôt d'exemple sert de test commun.
 */
const FRONTMATTER = /^---\r?\n([\s\S]*?)\r?\n---\r?\n([\s\S]*)$/;

export interface ParsedFichier<T = Record<string, unknown>> {
  readonly data: T;
  readonly body: string;
}

/** Un bloc présent mais illisible : distinct d'un bloc absent. */
export interface FrontmatterIllisible {
  readonly erreur: string;
  readonly body: string;
}

export function estIllisible(
  parse: ParsedFichier | FrontmatterIllisible | null,
): parse is FrontmatterIllisible {
  return parse !== null && "erreur" in parse;
}

/**
 * Retourne `null` si le bloc est absent, et `{ erreur }` s'il est présent mais
 * illisible. Confondre les deux fait dire « frontmatter absent » d'un fichier
 * qui en a un, et prive le lecteur de la seule information utile : où corriger.
 */
export function splitFrontmatter<T = Record<string, unknown>>(
  texte: string,
): ParsedFichier<T> | FrontmatterIllisible | null {
  const m = FRONTMATTER.exec(texte);
  if (!m) return null;
  try {
    return { data: (load(m[1]) ?? {}) as T, body: m[2] };
  } catch (e) {
    return { erreur: formatErreurYaml(e), body: m[2] };
  }
}

/**
 * Met en forme une erreur de `js-yaml`.
 *
 * Son `message` embarque un extrait multiligne du document, illisible dans une
 * liste d'anomalies : on garde la première ligne et les coordonnées.
 */
function formatErreurYaml(e: unknown): string {
  const err = e as {
    reason?: string;
    message?: string;
    mark?: { line?: number };
  };
  let raison = String(err?.reason ?? err?.message ?? e)
    .split("\n")[0]
    .trim();

  // Cause de loin la plus fréquente, et dont le message d'origine ne dit rien :
  // un « : » suivi d'une espace dans une valeur non quotée, que YAML lit comme
  // un séparateur. Un titre de décision en contient presque toujours un.
  if (/bad indentation of a mapping entry/.test(raison)) {
    raison += " — une valeur contenant « : » doit être entre apostrophes";
  }

  // `line` est indexée à zéro et relative au bloc : le `---` d'ouverture décale
  // d'une ligne de plus pour retrouver le numéro dans le fichier.
  const ligne = err?.mark?.line;
  return typeof ligne === "number"
    ? `frontmatter illisible ligne ${ligne + 2} : ${raison}`
    : `frontmatter illisible : ${raison}`;
}

/** Extrait une section de niveau 2 par son titre, sans le titre lui-même. */
export function extractSection(corps: string, titre: string): string {
  const echappe = titre.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const re = new RegExp(
    `^##[ \\t]+${echappe}[ \\t]*$([\\s\\S]*?)(?=^##[ \\t]|$(?![\\s\\S]))`,
    "m",
  );
  return re.exec(corps)?.[1].trim() ?? "";
}

/**
 * Les sections de niveau 2 qu'un cadrage rédigé par l'application porte, et que
 * la fiche comme l'éditeur savent présenter chacune à sa place.
 *
 * Tout le reste est libre : c'est ce que rend `extractSectionsLibres`.
 */
export const SECTIONS_CONNUES = [
  "Objectif",
  "Parcours utilisateur",
  "Énoncés",
] as const;

/**
 * Découpe les sections de niveau 2 dont le titre n'est pas dans la liste donnée,
 * dans leur ordre d'origine.
 *
 * Un cadrage peut porter ce que son auteur juge utile — un relevé de mesures,
 * des questions ouvertes, une note. Les ignorer aurait deux conséquences, l'une
 * à l'écriture et l'autre à la lecture : reconstruire le fichier à partir des
 * seules sections connues les effacerait sans le dire, et la fiche laisserait
 * hors de vue du texte que quelqu'un a écrit là pour être lu.
 */
export function extractSectionsLibres(
  corps: string,
  connues: readonly string[],
): SectionDivers[] {
  const normalise = (s: string) => s.trim().toLowerCase();
  const jeu = new Set(connues.map(normalise));

  const sections: SectionDivers[] = [];
  const re = /^##[ \t]+(.+?)[ \t]*$([\s\S]*?)(?=^##[ \t]|$(?![\s\S]))/gm;
  for (const m of corps.matchAll(re)) {
    if (!jeu.has(normalise(m[1]))) {
      sections.push({ titre: m[1].trim(), corps: m[2].trim() });
    }
  }
  return sections;
}

/**
 * Les mêmes sections, rendues en Markdown, titres compris.
 *
 * Sert à ne rien perdre en réécrivant : le texte revient dans le fichier tel
 * qu'il en est sorti.
 */
export function extractSectionsAutres(
  corps: string,
  connues: readonly string[],
): string {
  return (
    extractSectionsLibres(corps, connues)
      // Le corps est normalisé : une ligne vide après le titre, aucune à la fin.
      // Sans cela, réécrire ajoute une ligne à chaque enregistrement, l'espace du
      // séparateur s'ajoutant à celui que le bloc portait déjà.
      .map((s) => `## ${s.titre}\n\n${s.corps}`)
      .join("\n\n")
  );
}

/**
 * Extrait les énoncés d'un cadrage : les sous-sections de niveau 3 de la section
 * `## Énoncés`, indexées par identifiant de règle.
 *
 * Attention : `\Z` n'existe pas en JavaScript. Il faut `$(?![\s\S])`.
 */
export function extractEnonces(corps: string): Map<string, string> {
  const section = extractSection(corps, "Énoncés");
  const out = new Map<string, string>();
  if (!section) return out;

  const re = /^###[ \t]+(\S+)[ \t]*$([\s\S]*?)(?=^###[ \t]|$(?![\s\S]))/gm;
  for (const m of section.matchAll(re)) out.set(m[1], m[2].trim());
  return out;
}

/** Découpe les sous-sections de niveau 3 d'une section de niveau 2. */
export function extractSousSections(
  corps: string,
  titre: string,
): Map<string, string> {
  const section = extractSection(corps, titre);
  const out = new Map<string, string>();
  if (!section) return out;

  const re = /^###[ \t]+(.+?)[ \t]*$([\s\S]*?)(?=^###[ \t]|$(?![\s\S]))/gm;
  for (const m of section.matchAll(re)) out.set(m[1].trim(), m[2].trim());
  return out;
}
