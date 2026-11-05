import { GithubError, type RepoRef } from "../github/github-client";
import { TokenService } from "../github/token.service";
import { inject } from "../injection";
import type { Citation, Specification } from "../model/model";
import { RepoLoader } from "./repo-loader";

/**
 * Why a cited specification could not be read.
 *
 * - `sans-acces`: the platform refuses it to the current token, or does not
 *   show it — it answers the same for a repo that does not exist;
 * - `injoignable`: the platform did not respond, without saying anything about
 *   access;
 * - `prefixe-inconnu`: the citing project declares no specification under the
 *   citation's prefix.
 */
export type UnreadableReason = "sans-acces" | "injoignable" | "prefixe-inconnu";

/** What reading a cited specification gave. */
export type CitedRead =
  | { readonly kind: "lu"; readonly specification: Specification }
  | {
      readonly kind: "illisible";
      readonly reason: Exclude<UnreadableReason, "prefixe-inconnu">;
    };

/** What a citation designates in the cited specification. */
export type TargetKind = "regle" | "adr";

/**
 * The state of a citation — the ones the check warns about
 * (RG-citation-signalee-chez-le-citant).
 */
export type CitationState =
  | { readonly kind: "a-jour"; readonly targetKind: TargetKind }
  | {
      readonly kind: "modifiee";
      readonly targetKind: TargetKind;
      /** The most recent cited scoping that modified the target. */
      readonly since: string;
    }
  | { readonly kind: "abrogee"; readonly targetKind: TargetKind }
  | { readonly kind: "absente" }
  | { readonly kind: "non-verifiee"; readonly reason: UnreadableReason };

/**
 * The specifications the open project cites, read with the current access.
 *
 * Each is read once, however many citations name it, and only when a page
 * shows a citation: most rules cite nothing. The access is the reader's own
 * (INV-5): a cited specification their token does not open stays unread, and
 * the citation says so.
 */
export class CitedSpecifications {
  private readonly loader = inject(RepoLoader);
  private readonly tokens = inject(TokenService);
  private readonly reads = new Map<
    string,
    { readonly token: string | null; readonly read: Promise<CitedRead> }
  >();

  /**
   * The cited specification, read once per token that opens it: a refusal is
   * the token's (INV-5), and another token may open what this one does not.
   * Called from a reactive context, the token is tracked, and a change of
   * token reads it again.
   */
  read(repo: RepoRef): Promise<CitedRead> {
    const key = `${repo.owner}/${repo.repo}`.toLowerCase();
    const token = this.tokens.valueFor(repo);
    const known = this.reads.get(key);
    if (known && known.token === token) return known.read;

    const read = this.loader.loadSpecification(repo).then(
      (specification): CitedRead => ({ kind: "lu", specification }),
      (e: unknown): CitedRead => ({
        kind: "illisible",
        reason: isRefused(e) ? "sans-acces" : "injoignable",
      }),
    );
    this.reads.set(key, { token, read });
    return read;
  }
}

/** The platform refuses access, or does not show the repo. A reached limit is not a refusal. */
function isRefused(e: unknown): boolean {
  return (
    e instanceof GithubError &&
    (e.status === 401 ||
      e.status === 404 ||
      (e.status === 403 && !e.quotaExhausted))
  );
}

/**
 * The state of a citation, against the cited specification as it was read.
 *
 * `null` when the citation's prefix designates no cited specification.
 *
 * Standing in for `@ssk-it/canon-check` until it exports the comparison
 * (ssk-it/ssk-canon-action#64): the application must show the same state the
 * check warns about (INV-7).
 */
export function citationState(
  citation: Citation,
  read: CitedRead | null,
): CitationState {
  if (!read) return { kind: "non-verifiee", reason: "prefixe-inconnu" };
  if (read.kind === "illisible")
    return { kind: "non-verifiee", reason: read.reason };

  const rule = read.specification.rules.get(citation.target);
  const decision = rule
    ? undefined
    : read.specification.decisions.get(citation.target);
  const target = rule ?? decision;
  if (!target) return { kind: "absente" };

  const targetKind: TargetKind = rule ? "regle" : "adr";
  if (target.status === "abroge") return { kind: "abrogee", targetKind };

  const latest = [target.createdBy, ...target.modifiedBy]
    .filter((s): s is string => !!s)
    .reduce<string | null>(
      (a, b) => (a === null || compareScopings(b, a) > 0 ? b : a),
      null,
    );
  return latest && compareScopings(latest, citation.scoping) > 0
    ? { kind: "modifiee", targetKind, since: latest }
    : { kind: "a-jour", targetKind };
}

/** Orders two `AAAA-NNN` identifiers by year, then by number. */
function compareScopings(a: string, b: string): number {
  const [ya, na] = a.split("-").map(Number);
  const [yb, nb] = b.split("-").map(Number);
  return ya - yb || na - nb;
}
