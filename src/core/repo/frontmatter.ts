import { load } from "js-yaml";
import { MiscSection } from "../model/model";
import { repoText } from "./repo.messages";

/**
 * Frontmatter / body splitting.
 *
 * `gray-matter` is deliberately not used: it is a Node package that pulls in
 * server dependencies and behaves badly in a browser. The splitting
 * fits in one regular expression.
 *
 * This logic exists twice, here and in `actions/src/parse.mjs`. Both
 * must stay in agreement — see RG-parseur-partage. Any change here must
 * be carried over there, and the example repo serves as a shared test.
 */
const FRONTMATTER = /^---\r?\n([\s\S]*?)\r?\n---\r?\n([\s\S]*)$/;

export interface ParsedFile<T = Record<string, unknown>> {
  readonly data: T;
  readonly body: string;
}

/** A block present but unreadable: distinct from a missing block. */
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
 * Returns `null` if the block is absent, and `{ error }` if it is present but
 * unreadable. Confusing the two makes a file that has one read as
 * « frontmatter absent », and deprives the reader of the only useful information: where to fix.
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
 * Formats a `js-yaml` error.
 *
 * Its `message` embeds a multi-line excerpt of the document, unreadable in a
 * list of anomalies: the first line and the coordinates are kept.
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

  // By far the most frequent cause, and one the original message says nothing about:
  // a « : » followed by a space in an unquoted value, which YAML reads as
  // a separator. A decision title almost always contains one.
  if (/bad indentation of a mapping entry/.test(reason)) {
    reason += repoText().quoteColonHint;
  }

  // `line` is zero-indexed and relative to the block: the opening `---` shifts
  // by one more line to find the number in the file.
  const line = err?.mark?.line;
  return repoText().unreadableFrontmatter(
    reason,
    typeof line === "number" ? line + 2 : undefined,
  );
}

/** Extracts a level-2 section by its heading, without the heading itself. */
export function extractSection(body: string, title: string): string {
  const escaped = title.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const re = new RegExp(
    `^##[ \\t]+${escaped}[ \\t]*$([\\s\\S]*?)(?=^##[ \\t]|$(?![\\s\\S]))`,
    "m",
  );
  return re.exec(body)?.[1].trim() ?? "";
}

/**
 * The level-2 sections a scoping authored by the application carries, and that
 * the page as well as the editor can each present in its place.
 *
 * Everything else is free: that is what `extractFreeSections` returns.
 */
export const KNOWN_SECTIONS = [
  "Objectif",
  "Parcours utilisateur",
  "Énoncés",
] as const;

/**
 * Splits the level-2 sections whose heading is not in the given list,
 * in their original order.
 *
 * A scoping can carry whatever its author finds useful — a set of measurements,
 * open questions, a note. Ignoring them would have two consequences, one
 * on writing and the other on reading: rebuilding the file from the
 * known sections alone would erase them without saying so, and the page would leave
 * out of sight text someone wrote there to be read.
 */
export function extractFreeSections(
  body: string,
  known: readonly string[],
): MiscSection[] {
  const normalized = (s: string) => s.trim().toLowerCase();
  const set = new Set(known.map(normalized));

  return splitAtHeadings(body, "##").filter(
    (s) => !set.has(normalized(s.title)),
  );
}

/**
 * The same sections, rendered as Markdown, headings included.
 *
 * Used to lose nothing when rewriting: the text goes back into the file as
 * it came out of it.
 */
export function extractOtherSections(
  body: string,
  known: readonly string[],
): string {
  return (
    extractFreeSections(body, known)
      // The body is normalised: one blank line after the heading, none at the end.
      // Without that, rewriting adds a line at each save, the
      // separator's spacing adding to the one the block already carried.
      .map((s) => `## ${s.title}\n\n${s.body}`)
      .join("\n\n")
  );
}

/**
 * Extracts the statements of a scoping: the level-3 subsections of the
 * `## Énoncés` section, indexed by rule identifier.
 *
 * Beware: `\Z` does not exist in JavaScript. Use `$(?![\s\S])`.
 */
export function extractStatements(body: string): Map<string, string> {
  const section = extractSection(body, "Énoncés");
  const out = new Map<string, string>();
  if (!section) return out;

  const re = /^###[ \t]+(\S+)[ \t]*$([\s\S]*?)(?=^###[ \t]|$(?![\s\S]))/gm;
  for (const m of section.matchAll(re)) out.set(m[1], m[2].trim());
  return out;
}

/** Splits the level-3 subsections of a level-2 section. */
export function extractSubsections(
  body: string,
  title: string,
): Map<string, string> {
  const section = extractSection(body, title);
  const out = new Map<string, string>();
  if (!section) return out;

  for (const s of splitAtHeadings(section, "###")) out.set(s.title, s.body);
  return out;
}

/**
 * Splits a text at the headings of one level: each heading's title, and the text up to the next heading of that level, both trimmed.
 *
 * Read line by line rather than by a regular expression: one that stops at the next heading scans ahead from every line, and SonarCloud flags its backtracking (S8786).
 */
function splitAtHeadings(text: string, marker: "##" | "###"): MiscSection[] {
  const sections: MiscSection[] = [];
  let current: { title: string; lines: string[] } | null = null;
  const close = () => {
    if (current)
      sections.push({
        title: current.title,
        body: current.lines.join("\n").trim(),
      });
  };

  for (const line of text.split("\n")) {
    // A Windows line ending is not part of the title.
    const after = line.replace(/\r$/, "").slice(marker.length);
    // `##` followed by a space or a tab: `###` is not a level-2 heading.
    if (!line.startsWith(marker) || !/^[ \t]/.test(after)) {
      current?.lines.push(line);
      continue;
    }
    close();
    // A heading without a title ends the section before it, and opens none.
    current = after.length > 1 ? { title: after.trim(), lines: [] } : null;
  }
  close();
  return sections;
}
