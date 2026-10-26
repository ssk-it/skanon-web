/**
 * A scoping's status, derived from the repo state.
 *
 * Nothing is declared in the file: a `statut:` field would be a second
 * source for a fact the platform already establishes, and the Action's
 * checker rejects it. The derivation follows two distinct facts:
 *
 * - **the default branch establishes delivery.** A scoping it carries is
 *   delivered, with no other condition — that is the rule the Action applies, and the
 *   only one that holds for propagation.
 * - **the pull request carries the rest of the lifecycle.** A scoping that is not
 *   delivered yet lives on its branch, behind a pull request whose state says how far
 *   the review has got.
 *
 * This module knows neither GitHub nor Angular: it receives facts and returns a
 * status. That is what allows testing it without a network, and what keeps the
 * rule in a single place.
 */

import { ScopingProvenance, ScopingStatus } from "../model/model";

/**
 * The status that follows from where a scoping lives.
 *
 * A scoping without provenance comes from the default branch: the loader only
 * sets provenance on what it reads from a pull request branch.
 *
 * Without an identified pull request, an undelivered scoping is shown as a
 * draft: it is the least committal state, and the only one that can be asserted
 * when nothing indicates a review has started.
 */
export function deriveStatus(provenance?: ScopingProvenance): ScopingStatus {
  if (!provenance) return "livree";
  if (provenance.draft) return "brouillon";

  // An approved pull request means approval; everything else — no review given,
  // changes requested, failed call — stays in review. An approval is never
  // derived from an absence of information.
  if (provenance.approval === "APPROVED") return "validee";

  return "en_relecture";
}
