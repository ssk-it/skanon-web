import { lireRattachementsPiste } from "@ssk-it/canon-check/pistes";
import { GithubClient, GithubError, RepoRef } from "../github/github-client";
import { inject } from "../injection";
import { Scoping } from "../model/model";
import { signal } from "../signals";

/**
 * A roadmap item: what is envisaged for the product, carried by an issue of
 * the specification repo labelled `piste` (scoping 2026-058, RG-piste-definition).
 *
 * It does not belong to the specification: it has neither scoping identifier
 * nor status, and never mixes with what the repo contains.
 */
export interface RoadmapItemIssue {
  readonly number: number;
  readonly title: string;
  readonly url: string;
  readonly labels: readonly string[];
  /** The milestone's title, which carries the horizon; `null` without a milestone. */
  readonly milestone: string | null;
}

/** A roadmap item as a view shows it: its « en cours » state derived from scopings. */
export interface RoadmapItemView extends RoadmapItemIssue {
  /** The undelivered scopings that cite it through a `piste` link — RG-piste-etat-deduit. */
  readonly scopingsInProgress: readonly string[];
}

export type Horizon = "maintenant" | "ensuite" | "plus-tard" | "non-classee";

export interface HorizonGroup {
  readonly horizon: Horizon;
  readonly roadmapItems: readonly RoadmapItemView[];
}

export type RoadmapItemsState =
  "inactif" | "chargement" | "pret" | "droit-manquant" | "erreur";

/** The horizons in their display order — RG-piste-horizon. */
const HORIZON_ORDER: readonly Horizon[] = [
  "maintenant",
  "ensuite",
  "plus-tard",
  "non-classee",
];

/**
 * Reads the horizon in a milestone's title.
 *
 * Case and accents do not count: « Plus tard » and « plus-tard » designate
 * the same horizon. A milestone with another name gives no horizon, and its
 * roadmap item is placed with the unclassified ones rather than ahead.
 */
function horizonOfMilestone(milestone: string | null): Horizon {
  const key = (milestone ?? "")
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .trim()
    .toLowerCase()
    .replace(/[\s_]+/g, "-");
  return (HORIZON_ORDER as readonly string[]).includes(key) &&
    key !== "non-classee"
    ? (key as Horizon)
    : "non-classee";
}

/** The number of an issue of this repo that an address designates, or `null`. */
function issueNumber(url: string, repoRef: RepoRef): number | null {
  const m = /^https:\/\/github\.com\/([^/]+)\/([^/]+)\/issues\/(\d+)\/?$/.exec(
    url.trim(),
  );
  if (!m) return null;
  const sameRepo =
    m[1].toLowerCase() === repoRef.owner.toLowerCase() &&
    m[2].toLowerCase() === repoRef.repo.toLowerCase();
  return sameRepo ? Number(m[3]) : null;
}

/**
 * The roadmap items attached to a domain or a feature, with the undelivered
 * scopings that cite them.
 *
 * Attachment is read the way the automation checks it, through the shared
 * library (INV-7, RG-piste-rattachee). The link goes from the scoping to the
 * roadmap item, never the reverse: only a link of kind `piste` to an issue of
 * this repo counts.
 */
export function linkedRoadmapItems(
  issues: readonly RoadmapItemIssue[],
  collection: "domains" | "features",
  id: string,
  scopings: readonly Scoping[],
  repoRef: RepoRef,
): RoadmapItemView[] {
  const inProgress = new Map<number, string[]>();
  for (const c of scopings) {
    if (c.status === "livree") continue;
    for (const link of c.links) {
      if (link.tag !== "piste") continue;
      const number = issueNumber(link.url, repoRef);
      if (number === null) continue;
      inProgress.set(number, [...(inProgress.get(number) ?? []), c.id]);
    }
  }

  return issues
    .filter((i) =>
      lireRattachementsPiste(i.labels).some(
        (r) => r.collection === collection && r.id === id,
      ),
    )
    .map((i) => ({ ...i, scopingsInProgress: inProgress.get(i.number) ?? [] }));
}

/** Groups roadmap items by horizon, without empty groups — RG-piste-horizon. */
export function groupByHorizon(
  roadmapItems: readonly RoadmapItemView[],
): HorizonGroup[] {
  return HORIZON_ORDER.map((horizon) => ({
    horizon,
    roadmapItems: roadmapItems.filter(
      (p) => horizonOfMilestone(p.milestone) === horizon,
    ),
  })).filter((g) => g.roadmapItems.length > 0);
}

/**
 * A project's roadmap: its roadmap items, read once per project.
 *
 * A single list serves all views: a reader moving from one domain to another
 * does not pay for the call again (RG-pistes-a-part). It goes through the
 * client's regulated queue, like every API call (INV-6).
 */
export class RoadmapItemsService {
  private readonly github = inject(GithubClient);

  readonly state = signal<RoadmapItemsState>("inactif");
  readonly issues = signal<readonly RoadmapItemIssue[]>([]);
  readonly error = signal<string | null>(null);

  private key: string | null = null;
  private inFlight: Promise<void> | null = null;

  load(repoRef: RepoRef): Promise<void> {
    const key = `${repoRef.owner}/${repoRef.repo}`.toLowerCase();
    if (key === this.key && this.inFlight) return this.inFlight;

    this.key = key;
    this.state.set("chargement");
    this.issues.set([]);
    this.error.set(null);
    this.inFlight = this.read(repoRef, key);
    return this.inFlight;
  }

  private async read(repoRef: RepoRef, key: string): Promise<void> {
    try {
      const raw = await this.github.listRoadmapItems(repoRef);
      if (key !== this.key) return;
      this.issues.set(
        raw.map((i) => ({
          number: i.number,
          title: i.title,
          url: i.html_url,
          labels: i.labels
            .map((l) => (typeof l === "string" ? l : (l.name ?? "")))
            .filter((l) => l !== ""),
          milestone: i.milestone?.title ?? null,
        })),
      );
      this.state.set("pret");
    } catch (e) {
      if (key !== this.key) return;
      // A 403 that is not an exhausted quota: the token has no right to read
      // issues. Say so as is, rather than an empty section that would read
      // « rien n'est envisagé » (RG-message-nomme-la-cause).
      if (e instanceof GithubError && e.status === 403 && !e.quotaExhausted) {
        this.state.set("droit-manquant");
        return;
      }
      this.error.set(
        e instanceof Error ? e.message : "Les pistes n'ont pas pu être lues.",
      );
      this.state.set("erreur");
      // An error is not kept: the next view will retry.
      this.inFlight = null;
    }
  }
}
