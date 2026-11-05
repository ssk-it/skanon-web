import type { Citation, CitedRepo } from "../model/model";

/*
 * Reading the citation fields of the format — RG-regle-du-socle-citee.
 *
 * Standing in for `@ssk-it/canon-check` until it reads them
 * (ssk-it/ssk-canon-action#64): format reading is written once, there (INV-7).
 * This module goes away as soon as the library exports its reader.
 */

/** `prefixe:IDENTIFIANT@AAAA-NNN`. */
const CITATION = /^([\w.-]+):([A-Za-z][\w.-]*)@(\d{4}-\d{3,})$/;

/** One entry of `applique`, or `null` when it is not a citation. */
export function parseCitation(raw: unknown): Citation | null {
  const m = typeof raw === "string" ? CITATION.exec(raw.trim()) : null;
  return m ? { prefix: m[1], target: m[2], scoping: m[3] } : null;
}

/** The `applique` field of a rule or an architecture decision. */
export function parseApplies(raw: unknown): Citation[] {
  if (!Array.isArray(raw)) return [];
  return raw.map(parseCitation).filter((c) => c !== null);
}

/** The `referentiels_cites` block of `ssk-canon.yml`. */
export function parseCitedRepos(raw: unknown): CitedRepo[] {
  if (!Array.isArray(raw)) return [];
  return raw.flatMap((entry) => {
    const e = (entry ?? {}) as Record<string, unknown>;
    const prefix = typeof e["prefixe"] === "string" ? e["prefixe"].trim() : "";
    const repo =
      typeof e["repo"] === "string"
        ? /^([\w.-]+)\/([\w.-]+)$/.exec(e["repo"].trim())
        : null;
    return prefix && repo
      ? [{ prefix, repo: { owner: repo[1], repo: repo[2] } }]
      : [];
  });
}
