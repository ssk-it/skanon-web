import type { RepoRef } from "../../core/github/github-client";

/**
 * The periods Evolution offers in one gesture — RG-periode-par-defaut.
 *
 * `libre` lets the user choose both dates; the others are computed from now.
 */
export type Period = "7-jours" | "visite" | "30-jours" | "3-mois" | "libre";

const DAY = 86_400_000;

const LOOKBACK_DAYS: Partial<Record<Period, number>> = {
  "7-jours": 7,
  "30-jours": 30,
  "3-mois": 90,
};

/**
 * The start of a period, or `null` when it cannot be computed: free dates, or unknown last visit.
 */
export function periodStart(
  period: Period,
  now: Date,
  visit: Date | null,
): Date | null {
  if (period === "visite") return visit;
  const days = LOOKBACK_DAYS[period];
  return days === undefined ? null : new Date(now.getTime() - days * DAY);
}

/**
 * The date of the previous visit, per project, on this machine.
 *
 * It belongs to the reader: keeping it in the repo would turn a personal habit into a shared fact (2026-044, decision 04). It is lost with the machine, which costs only a thirty-day period, not an error.
 *
 * **Frozen for the session.** Recording the current visit at each opening would bring the period down to one minute on the first reload. The previous visit is therefore read once, kept for the session, and only then does the current visit replace it for the next time.
 *
 * The browser's storage may be missing or refuse: the view then falls back to thirty days, without losing anything else.
 */
export class LastVisit {
  visit(repoRef: RepoRef, now: Date = new Date()): Date | null {
    const key = `pc-evolution-visite:${repoRef.owner}/${repoRef.repo}`;
    try {
      const chosen = sessionStorage.getItem(key);
      if (chosen !== null) return chosen ? new Date(chosen) : null;

      const previous = localStorage.getItem(key);
      sessionStorage.setItem(key, previous ?? "");
      localStorage.setItem(key, now.toISOString());
      return previous ? new Date(previous) : null;
    } catch {
      return null;
    }
  }
}
