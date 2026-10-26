import { inject } from "../injection";
import { signal } from "../signals";
import { GithubClient, RepoRef } from "../github/github-client";
import { RepoConfig, sameRepo } from "./repo-config";
import { repoText } from "./repo.messages";

/** A repo offered for selection, with what is known about it. */
export interface KnownRepo {
  readonly repoRef: RepoRef;
  /** Carries a specification — checked, not assumed. */
  readonly framed: boolean;
  /** Already opened in the past. */
  readonly recent: boolean;
}

/**
 * The repos offered for selection: those already opened, and those the access allows.
 *
 * Two origins that do not replace each other. Memory keeps the projects
 * one works on, including signed out; discovery says what
 * the current access really allows, which no memory can know.
 */
export class KnownReposService {
  private readonly github = inject(GithubClient);
  private readonly config = inject(RepoConfig);

  readonly repos = signal<readonly KnownRepo[]>([]);
  readonly inProgress = signal(false);
  readonly error = signal<string | null>(null);

  /**
   * Gathers the known repos, and checks which ones carry a specification.
   *
   * Recent ones are offered immediately, even before discovery
   * completes: they are already known, and making them wait for a network call
   * would make them less accessible than before.
   */
  async refresh(): Promise<void> {
    if (this.inProgress()) return;
    this.inProgress.set(true);
    this.error.set(null);

    const recents = this.config.recents();
    this.repos.set(
      recents.map((repoRef) => ({
        repoRef: repoRef,
        framed: false,
        recent: true,
      })),
    );

    try {
      const allowed = await this.github.listReposAllTokens();
      const all = [
        // The platform's spelling wins over that of an input: two
        // cases for one organization would split it in two on screen.
        ...recents.map((r) => allowed.find((a) => sameRepo(r, a)) ?? r),
        ...allowed.filter((a) => !recents.some((r) => sameRepo(r, a))),
      ];

      // The check goes through the client's queue, which bounds
      // concurrency: it is what protects against secondary limits.
      const framedRepos = await Promise.all(
        all.map((d) => this.github.isScopingRepo(d)),
      );

      this.repos.set(
        all
          .map((repoRef, i) => ({
            repoRef: repoRef,
            framed: framedRepos[i],
            recent: recents.some((r) => sameRepo(r, repoRef)),
          }))
          // Framed ones first: they are the only ones the application can
          // open. The others stay offered, an empty repo one wants to
          // bootstrap having no specification yet.
          .sort((a, b) => Number(b.framed) - Number(a.framed)),
      );
    } catch (e) {
      // A failing discovery must not take the recent ones with it: they are
      // what stays useful when access is missing.
      this.error.set(
        e instanceof Error ? e.message : repoText().knownReposFailed,
      );
    } finally {
      this.inProgress.set(false);
    }
  }
}

/** The repos of a same organization, presented together. */
export interface OrganizationGroup {
  readonly organization: string;
  readonly repos: readonly KnownRepo[];
}

/**
 * Sorts the repos by organization, so that a long list can be browsed.
 *
 * Organizations by name; within each, specifications first — they are
 * the only ones the application can open, see RG-projets-connus —, then by
 * name. Case separates nothing, the platform not distinguishing it.
 */
export function groupReposByOrganization(
  repos: readonly KnownRepo[],
): OrganizationGroup[] {
  const byKey = new Map<string, KnownRepo[]>();
  for (const d of repos) {
    const key = d.repoRef.owner.toLowerCase();
    const group = byKey.get(key);
    if (group) group.push(d);
    else byKey.set(key, [d]);
  }

  const byName = (a: string, b: string) =>
    a.localeCompare(b, "fr", { sensitivity: "base" });
  return [...byKey.values()]
    .map((group) => ({
      organization: group[0].repoRef.owner,
      repos: [...group].sort(
        (a, b) =>
          Number(b.framed) - Number(a.framed) ||
          byName(a.repoRef.repo, b.repoRef.repo),
      ),
    }))
    .sort((a, b) => byName(a.organization, b.organization));
}
