import { load } from "js-yaml";
import { MiscSection } from "../model/model";

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

export interface ParsedFile<T = Record<string, unknown>> {
  readonly data: T;
  readonly body: string;
}

/** Un bloc présent mais illisible : distinct d'un bloc absent. */
export interface UnreadableFrontmatter {
  readonly error: string;
  readonly body: string;
}

export function isUnreadable(
  parse: ParsedFile | UnreadableFrontmatter | null,
): parse is UnreadableFrontmatter {
  return parse !== null && "error" in parse;
}

/**
 * Retourne `null` si le bloc est absent, et `{ erreur }` s'il est présent mais
 * illisible. Confondre les deux fait dire « frontmatter absent » d'un fichier
 * qui en a un, et prive le lecteur de la seule information utile : où corriger.
 */
export function splitFrontmatter<T = Record<string, unknown>>(
  text: string,
): ParsedFile<T> | UnreadableFrontmatter | null {
  const m = FRONTMATTER.exec(text);
  if (!m) return null;
  try {
    return { data: (load(m[1]) ?? {}) as T, body: m[2] };
  } catch (e) {
    return { error: formatYamlError(e), body: m[2] };
  }
}

/**
 * Met en forme une erreur de `js-yaml`.
 *
 * Son `message` embarque un extrait multiligne du document, illisible dans une
 * liste d'anomalies : on garde la première ligne et les coordonnées.
 */
function formatYamlError(e: unknown): string {
  const err = e as {
    reason?: string;
    message?: string;
    mark?: { line?: number };
  };
  let reason = String(err?.reason ?? err?.message ?? e)
    .split("\n")[0]
    .trim();

  // Cause de loin la plus fréquente, et dont le message d'origine ne dit rien :
  // un « : » suivi d'une espace dans une valeur non quotée, que YAML lit comme
  // un séparateur. Un titre de décision en contient presque toujours un.
  if (/bad indentation of a mapping entry/.test(reason)) {
    reason += " — une valeur contenant « : » doit être entre apostrophes";
  }

  // `line` est indexée à zéro et relative au bloc : le `---` d'ouverture décale
  // d'une ligne de plus pour retrouver le numéro dans le fichier.
  const line = err?.mark?.line;
  return typeof line === "number"
    ? `frontmatter illisible ligne ${line + 2} : ${reason}`
    : `frontmatter illisible : ${reason}`;
}

/** Extrait une section de niveau 2 par son titre, sans le titre lui-même. */
export function extractSection(body: string, title: string): string {
  const escaped = title.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const re = new RegExp(
    `^##[ \\t]+${escaped}[ \\t]*$([\\s\\S]*?)(?=^##[ \\t]|$(?![\\s\\S]))`,
    "m",
  );
  return re.exec(body)?.[1].trim() ?? "";
}

/**
 * Les sections de niveau 2 qu'un cadrage rédigé par l'application porte, et que
 * la fiche comme l'éditeur savent présenter chacune à sa place.
 *
 * Tout le reste est libre : c'est ce que rend `extractSectionsLibres`.
 */
export const KNOWN_SECTIONS = [
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
export function extractFreeSections(
  body: string,
  known: readonly string[],
): MiscSection[] {
  const normalized = (s: string) => s.trim().toLowerCase();
  const set = new Set(known.map(normalized));

  const sections: MiscSection[] = [];
  const re = /^##[ \t]+(.+?)[ \t]*$([\s\S]*?)(?=^##[ \t]|$(?![\s\S]))/gm;
  for (const m of body.matchAll(re)) {
    if (!set.has(normalized(m[1]))) {
      sections.push({ title: m[1].trim(), body: m[2].trim() });
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
export function extractOtherSections(
  body: string,
  known: readonly string[],
): string {
  return (
    extractFreeSections(body, known)
      // Le corps est normalisé : une ligne vide après le titre, aucune à la fin.
      // Sans cela, réécrire ajoute une ligne à chaque enregistrement, l'espace du
      // séparateur s'ajoutant à celui que le bloc portait déjà.
      .map((s) => `## ${s.title}\n\n${s.body}`)
      .join("\n\n")
  );
}

/**
 * Extrait les énoncés d'un cadrage : les sous-sections de niveau 3 de la section
 * `## Énoncés`, indexées par identifiant de règle.
 *
 * Attention : `\Z` n'existe pas en JavaScript. Il faut `$(?![\s\S])`.
 */
export function extractStatements(body: string): Map<string, string> {
  const section = extractSection(body, "Énoncés");
  const out = new Map<string, string>();
  if (!section) return out;

  const re = /^###[ \t]+(\S+)[ \t]*$([\s\S]*?)(?=^###[ \t]|$(?![\s\S]))/gm;
  for (const m of section.matchAll(re)) out.set(m[1], m[2].trim());
  return out;
}

/** Découpe les sous-sections de niveau 3 d'une section de niveau 2. */
export function extractSubsections(
  body: string,
  title: string,
): Map<string, string> {
  const section = extractSection(body, title);
  const out = new Map<string, string>();
  if (!section) return out;

  const re = /^###[ \t]+(.+?)[ \t]*$([\s\S]*?)(?=^###[ \t]|$(?![\s\S]))/gm;
  for (const m of section.matchAll(re)) out.set(m[1].trim(), m[2].trim());
  return out;
}
