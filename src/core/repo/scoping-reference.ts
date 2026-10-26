import type { Scoping } from "../model/model";

/** The repo that carries the cited scoping. */
export interface ShortRepoRef {
  readonly owner: string;
  readonly repo: string;
}

/**
 * Where a reference to a scoping leads, depending on the scoping's state.
 *
 * Only three outcomes, and each tells the reader something different: the
 * page exists, the discussion is open, or this repo does not know this
 * identifier.
 */
export type ReferenceTarget =
  | {
      readonly kind: "fiche";
      readonly link: unknown[];
      readonly label: string;
    }
  | {
      readonly kind: "demande";
      readonly url: string;
      readonly label: string;
      /** True as long as the pull request is a draft: the discussion is not open. */
      readonly inProgress: boolean;
    }
  | { readonly kind: "inconnu"; readonly label: string };

/**
 * Resolves a reference written by identifier — RG-reference-par-identifiant.
 *
 * A scoping carries a provenance as long as it lives on its branch; losing it
 * is what marks its delivery. The target thus follows the lifecycle without
 * the text citing the identifier ever having to be rewritten.
 *
 * An identifier the repo does not carry is not treated as a fault: the
 * scoping may be in progress elsewhere, on a branch this load did not see.
 * Saying so is better than making up a dead link.
 */
export function resolveScopingReference(
  id: string,
  scopings: Iterable<Scoping>,
  repoRef: ShortRepoRef,
): ReferenceTarget {
  const scoping = [...scopings].find((c) => c.id === id);
  if (!scoping) return { kind: "inconnu", label: id };

  const p = scoping.provenance;
  if (p) {
    return {
      kind: "demande",
      // Without a pull request, the branch is what can be consulted.
      url: p.pullRequest
        ? `https://github.com/${repoRef.owner}/${repoRef.repo}/pull/${p.pullRequest}`
        : `https://github.com/${repoRef.owner}/${repoRef.repo}/tree/${p.branch}`,
      label: id,
      inProgress: p.draft,
    };
  }

  return {
    kind: "fiche",
    link: ["/", repoRef.owner, repoRef.repo, "cadrages", id],
    label: id,
  };
}

/** A scoping identifier, as stored: `AAAA-NNN`. */
const IDENTIFIER_SHAPE = /^\d{4}-\d{3,}$/;

/**
 * The identifier stored behind a reference, prefixed or not — RG-prefixe-projet.
 *
 * The prefix is an additional way in, not an identifier: the unprefixed form
 * stays accepted and stays the one that is recorded. A prefix that is not the
 * project's, on the other hand, designates a scoping that is not here — a
 * numerically valid identifier is not enough.
 *
 * Returns `null` when the reference designates nothing in this project.
 */
export function extractScopingIdentifier(
  reference: string,
  prefix: string | null,
): string | null {
  const own = reference.trim();
  if (IDENTIFIER_SHAPE.test(own)) return own;

  if (!prefix) return null;
  const expected = `${prefix}-`;
  if (!own.startsWith(expected)) return null;

  const rest = own.slice(expected.length);
  return IDENTIFIER_SHAPE.test(rest) ? rest : null;
}

/**
 * The identifier as it is given to read — RG-prefixe-projet.
 *
 * The prefix is added here, and nowhere else: what is stored stays bare. A
 * prefixed identifier copied from the application nevertheless works as an
 * address, routing accepting both forms — this is what makes the gap between
 * the displayed and the stored invisible to the reader.
 */
export function displayIdentifier(id: string, prefix: string | null): string {
  return prefix ? `${prefix}-${id}` : id;
}
