import { signal } from "../signals";
import { RepoRef } from "../github/github-client";
import { trimTrailing } from "../text";

const KEY = "ssk-canon.depot";
const RECENTS_KEY = "ssk-canon.depots-recents";

/** How many repos are kept in memory. */
const MAX_RECENTS = 12;

/** Two repos are the same if the organisation and the name match, case
    not being significant on the platform. */
export function sameRepo(a: RepoRef, b: RepoRef): boolean {
  return (
    a.owner.toLowerCase() === b.owner.toLowerCase() &&
    a.repo.toLowerCase() === b.repo.toLowerCase()
  );
}

/** Repo opened by default: the product's demonstration one. */
export const DEFAULT_REPO: RepoRef = {
  owner: "ssk-it",
  repo: "ssk-canon",
};

/**
 * The project repo currently open.
 *
 * Remembered in the browser to avoid typing it again, and changeable without
 * rebuilding.
 */
export class RepoConfig {
  readonly repoRef = signal<RepoRef>(this.readRepo());

  /**
   * The already opened repos, the latest first.
   *
   * A project's specification is consulted over time, and one moves from one
   * project to another: retyping it each time is a friction that teaches
   * nobody anything.
   */
  readonly recents = signal<readonly RepoRef[]>(this.readRecents());

  saveRepo(repoRef: RepoRef): void {
    this.repoRef.set(repoRef);
    try {
      localStorage.setItem(KEY, JSON.stringify(repoRef));
    } catch {
      // private browsing or blocked storage: the value is kept in memory
    }
  }

  /**
   * Remembers a repo actually opened.
   *
   * Called after a successful load, and not when it is requested: a repo not
   * found or malformed has no place in the list of projects being worked on.
   */
  rememberOpened(repoRef: RepoRef): void {
    this.remember(repoRef);
  }

  /** Removes a repo from memory, without touching the one that is open. */
  forget(repoRef: RepoRef): void {
    this.writeRecents(this.recents().filter((d) => !sameRepo(d, repoRef)));
  }

  /**
   * Puts a repo at the top of the recent ones.
   *
   * The same repo appears there only once: reopening a project moves it up
   * rather than duplicating it.
   */
  private remember(repoRef: RepoRef): void {
    const deduplicated = this.recents().filter((d) => !sameRepo(d, repoRef));
    this.writeRecents([repoRef, ...deduplicated].slice(0, MAX_RECENTS));
  }

  private writeRecents(list: readonly RepoRef[]): void {
    this.recents.set(list);
    try {
      localStorage.setItem(RECENTS_KEY, JSON.stringify(list));
    } catch {
      // same
    }
  }

  private readRecents(): readonly RepoRef[] {
    try {
      const raw = localStorage.getItem(RECENTS_KEY);
      if (raw) {
        const list = JSON.parse(raw) as RepoRef[];
        if (Array.isArray(list)) {
          return list.filter((d) => d?.owner && d?.repo).slice(0, MAX_RECENTS);
        }
      }
    } catch {
      // same
    }
    return [];
  }

  private readRepo(): RepoRef {
    try {
      const raw = localStorage.getItem(KEY);
      if (raw) {
        const d = JSON.parse(raw) as RepoRef;
        if (d?.owner && d?.repo) return d;
      }
    } catch {
      // same
    }
    return DEFAULT_REPO;
  }

  /** Accepts « owner/repo » or a full GitHub URL. */
  static parseRepo(input: string): RepoRef | null {
    const cleaned = trimTrailing(input.trim().replace(/\.git$/, ""), "/");
    if (!cleaned) return null;

    const url = /github\.com\/([^/]+)\/([^/]+)/.exec(cleaned);
    if (url) return { owner: url[1], repo: url[2] };

    const short = /^([\w.-]+)\/([\w.-]+)$/.exec(cleaned);
    if (short) return { owner: short[1], repo: short[2] };

    return null;
  }
}
