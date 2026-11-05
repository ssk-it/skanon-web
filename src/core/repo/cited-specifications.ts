import { comparerCadrages, etatDeCible } from "@ssk-it/canon-check/citations";
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
      /** Modified by a cited scoping more recent than the noted one. */
      readonly kind: "perimee";
      readonly targetKind: TargetKind;
      /** The most recent cited scoping that modified the target. */
      readonly since: string;
    }
  | {
      readonly kind: "abrogee";
      readonly targetKind: TargetKind;
      /** The cited scoping that repealed it, when known. */
      readonly repealedBy: string | null;
    }
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
 * `null` when the citation's prefix designates no cited specification. The
 * comparison is `@ssk-it/canon-check`'s, the one the check warns with (INV-7):
 * the application shows the same state.
 */
export function citationState(
  citation: Citation,
  read: CitedRead | null,
): CitationState {
  if (!read) return { kind: "non-verifiee", reason: "prefixe-inconnu" };
  if (read.kind === "illisible")
    return { kind: "non-verifiee", reason: read.reason };

  const rule = read.specification.rules.get(citation.target);
  const target = rule ?? read.specification.decisions.get(citation.target);
  const targetKind: TargetKind = rule ? "regle" : "adr";
  const state = etatDeCible(
    { cadrage: citation.scoping },
    target ? { statut: target.status, modifie_par: target.modifiedBy } : null,
  );
  switch (state.etat) {
    case "absente":
      return { kind: "absente" };
    case "abrogee":
      return { kind: "abrogee", targetKind, repealedBy: state.cadrage ?? null };
    case "perimee": {
      const since = [...(state.recents ?? [])].sort(comparerCadrages).at(-1);
      return { kind: "perimee", targetKind, since: since ?? citation.scoping };
    }
    default:
      return { kind: "a-jour", targetKind };
  }
}
