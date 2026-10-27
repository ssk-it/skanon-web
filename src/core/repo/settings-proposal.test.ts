import { inject, provide, resetInjection } from "../injection";
import { beforeEach, describe, expect, it } from "vitest";
import { GithubClient, GithubError, RepoRef } from "../github/github-client";
import { SpecificationStore } from "./specification.store";
import { CONFIG_NAME, SettingsService } from "./settings.service";
import { EditableSettings } from "./config-writer";

/**
 * Changing the project's settings: `ssk-canon.yml` decides the tool's behaviour
 * for everyone, so a change goes through a branch and a pull request, never
 * straight to the main branch.
 *
 * A second change before review completes the first proposal: same branch, same
 * pull request, written over what that branch already carries.
 */

const REPO = { owner: "org", repo: "projet" };
const BRANCH = "reglages";

const ON_MAIN = "schema_version: 1\nprojet:\n  nom: Essai\n";

const SETTINGS: EditableSettings = { tokenProtection: "exigee" };

let branches: Record<string, Record<string, { content: string; sha: string }>>;
let pullRequests: Record<string, number>;
let calls: string[];
let createBranchFails: GithubError | null;
/** A branch created after the listing: the listing does not see it yet. */
let unlisted: string[];
let commits: Array<{
  branch: string;
  path: string;
  content: string;
  currentSha?: string;
}>;

beforeEach(() => {
  branches = { main: { [CONFIG_NAME]: { content: ON_MAIN, sha: "sha-main" } } };
  pullRequests = {};
  calls = [];
  commits = [];
  createBranchFails = null;
  unlisted = [];
  resetInjection();
  provide(SpecificationStore, { repoRef: () => REPO });
  provide(GithubClient, {
    loadRepo: async () => ({ defaultBranch: "main", description: null }),
    listBranches: async (_r: RepoRef, prefix: string) =>
      Object.keys(branches).filter(
        (b) => b.startsWith(prefix) && !unlisted.includes(b),
      ),
    branchSha: async (_r: RepoRef, branch: string) => `tete-${branch}`,
    createBranch: async (_r: RepoRef, name: string, from: string) => {
      calls.push(`createBranch ${name} ${from}`);
      if (createBranchFails) throw createBranchFails;
      branches[name] = { ...branches.main };
    },
    loadEditableFile: async (_r: RepoRef, path: string, branch: string) => {
      const file = branches[branch]?.[path];
      if (!file) throw new GithubError("introuvable", 404);
      return { ...file };
    },
    commitFile: async (
      _r: RepoRef,
      branch: string,
      path: string,
      content: string,
      _message: string,
      currentSha?: string,
    ) => {
      if (branches[branch][path]?.sha !== currentSha)
        throw new GithubError("conflit", 409);
      commits.push({ branch, path, content, currentSha });
      branches[branch][path] = { content, sha: `sha-${commits.length}` };
      return { commit: `c-${commits.length}`, file: `sha-${commits.length}` };
    },
    findPullRequestForBranch: async (_r: RepoRef, branch: string) =>
      pullRequests[branch]
        ? { number: pullRequests[branch], draft: false }
        : null,
    createPullRequest: async (_r: RepoRef, head: string, base: string) => {
      calls.push(`createPullRequest ${head} -> ${base}`);
      pullRequests[head] = 40;
      return 40;
    },
  });
});

describe("Proposing a change to the settings", () => {
  it("opens a branch from the main one, writes there, and opens a pull request", async () => {
    const proposed = await inject(SettingsService).proposeSettings(SETTINGS);

    expect(calls).toEqual([
      `createBranch ${BRANCH} tete-main`,
      `createPullRequest ${BRANCH} -> main`,
    ]);
    expect(commits).toEqual([
      expect.objectContaining({
        branch: BRANCH,
        path: CONFIG_NAME,
        currentSha: "sha-main",
      }),
    ]);
    expect(commits[0].content).toContain("protection_du_jeton: exigee");
    expect(branches.main[CONFIG_NAME].content).toBe(ON_MAIN);
    expect(proposed).toEqual({
      branch: BRANCH,
      pullRequest: 40,
      url: "https://github.com/org/projet/pull/40",
    });
  });

  it("completes a proposal in progress: same branch, written over what it carries, same pull request", async () => {
    branches[BRANCH] = {
      [CONFIG_NAME]: {
        content: ON_MAIN.replace("Essai", "Essai modifié"),
        sha: "sha-reglages",
      },
    };
    pullRequests[BRANCH] = 12;

    const proposed = await inject(SettingsService).proposeSettings(SETTINGS);

    expect(calls).toEqual([]);
    expect(commits[0].currentSha).toBe("sha-reglages");
    // What the proposal already changed stays: it is completed, not overwritten from the main branch.
    expect(commits[0].content).toContain("Essai modifié");
    expect(proposed.pullRequest).toBe(12);
  });

  it("goes on when the branch appeared in between — a 422 says it exists", async () => {
    createBranchFails = new GithubError("Reference already exists", 422);
    branches[BRANCH] = { ...branches.main };
    unlisted = [BRANCH];

    const proposed = await inject(SettingsService).proposeSettings(SETTINGS);

    expect(commits).toHaveLength(1);
    expect(proposed.pullRequest).toBe(40);
  });

  it("stops on any other failure to create the branch, and writes nothing", async () => {
    createBranchFails = new GithubError("Accès refusé", 403);

    await expect(
      inject(SettingsService).proposeSettings(SETTINGS),
    ).rejects.toThrow("Accès refusé");
    expect(commits).toEqual([]);
  });
});
