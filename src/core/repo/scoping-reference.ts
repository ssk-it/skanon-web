import type { CitedRepo, Scoping } from "../model/model";

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

/** A rule's or an architecture decision's identifier, as stored: `RG-…`, `ADR-…`. */
export const RULE_SHAPE = /^[A-Za-z][\w.-]*$/;

/** What a project says about its prefixes: its own, and those of the specifications it cites. */
export interface ProjectPrefixes {
  readonly prefix: string | null;
  readonly citedRepos: readonly CitedRepo[];
}

/** Where a reference leads: here, or to the specification a cited prefix designates. */
export type LocatedReference =
  | { readonly repo: null; readonly id: string }
  | {
      readonly repo: ShortRepoRef;
      readonly prefix: string;
      readonly id: string;
    };

/** The separators a prefix is written with: the hyphen it is displayed with, the colon a citation uses. */
const SEPARATORS = ["-", ":"] as const;

/** What follows `prefix` and a separator in `reference`, or `null`. */
function afterPrefix(reference: string, prefix: string): string | null {
  for (const separator of SEPARATORS) {
    if (reference.startsWith(prefix + separator))
      return reference.slice(prefix.length + 1);
  }
  return null;
}

/**
 * The stored identifier behind a reference, and the repo it lives in —
 * RG-prefixe-projet.
 *
 * A prefix designates either the project that declares it, or a specification
 * it cites, under the alias it gave it in `referentiels_cites` (scoping
 * 2026-068). The unprefixed form stays accepted and stays the one that is
 * recorded. A prefix that is neither designates an unknown address: a
 * well-formed identifier behind it is not enough.
 *
 * Returns `null` when the reference designates nothing.
 */
export function locateReference(
  reference: string,
  project: ProjectPrefixes,
  shape: RegExp = IDENTIFIER_SHAPE,
): LocatedReference | null {
  const own = reference.trim();

  if (project.prefix) {
    const rest = afterPrefix(own, project.prefix);
    if (rest !== null && shape.test(rest)) return { repo: null, id: rest };
  }
  for (const cited of project.citedRepos) {
    const rest = afterPrefix(own, cited.prefix);
    if (rest !== null && shape.test(rest))
      return { repo: cited.repo, prefix: cited.prefix, id: rest };
  }
  return shape.test(own) ? { repo: null, id: own } : null;
}

/**
 * The identifier stored behind a reference, when it designates this project —
 * RG-prefixe-projet.
 *
 * Returns `null` when the reference designates nothing in this project.
 */
export function extractScopingIdentifier(
  reference: string,
  prefix: string | null,
): string | null {
  const located = locateReference(reference, { prefix, citedRepos: [] });
  return located && located.repo === null ? located.id : null;
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
