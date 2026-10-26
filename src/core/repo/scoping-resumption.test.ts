import { inject, provide, resetInjection } from "../injection";
import { beforeEach, describe, expect, it } from "vitest";
import { GithubClient, GithubError } from "../github/github-client";
import { RepoConfig } from "./repo-config";
import { AuthoringService } from "./authoring.service";

/**
 * Resuming a scoping — RG-cadrage-livre-immuable and
 * RG-cadrages-en-cours-visibles.
 *
 * A scoping the main branch carries is delivered, and is no longer modified:
 * loading it from there to write to it directly would bypass verification. A
 * scoping in progress, for its part, is resumed from its branch, whether or
 * not a pull request carries it yet.
 */
describe("Resuming a scoping", () => {
  const PATH = "cadrages/2026-060/cadrage.md";
  const CONTENT = "---\nid: 2026-060\ntitre: Un cadrage\n---\n";

  /** What each branch of the repo carries, by path. */
  let branches: Record<string, string[]>;
  let requests: Array<{ number: number; branch: string }>;

  beforeEach(() => {
    branches = { main: [] };
    requests = [];
    resetInjection();
    provide(GithubClient, {
      loadRepo: async () => ({ defaultBranch: "main", description: null }),
      listOpenPullRequests: async () =>
        requests.map((d) => ({ ...d, draft: false, approval: null })),
      listScopingBranches: async () =>
        Object.keys(branches).filter((b) => /^cadrage[-/]/.test(b)),
      loadEditableFile: async (
        _repo: unknown,
        path: string,
        branch: string,
      ) => {
        if (!branches[branch]?.includes(path))
          throw new GithubError("Dépôt ou fichier introuvable.", 404);
        return { content: CONTENT, sha: `sha-${branch}` };
      },
      loadTree: async () => {
        throw new GithubError("hors du sujet", 0);
      },
    });
    inject(RepoConfig).saveRepo({ owner: "org", repo: "depot" });
  });

  it("refuses a delivered scoping, and says to go through a new scoping", async () => {
    branches.main = [PATH];

    await expect(
      inject(AuthoringService).loadForEditing("2026-060"),
    ).rejects.toThrow(/livré.*nouveau cadrage/s);
  });

  it("refuses a delivered scoping even when a branch still carries it", async () => {
    branches.main = [PATH];
    branches["cadrage-2026-060"] = [PATH];
    requests = [{ number: 4, branch: "cadrage-2026-060" }];

    await expect(
      inject(AuthoringService).loadForEditing("2026-060"),
    ).rejects.toThrow(/livré/);
  });

  it("loads a scoping in progress from its pull request's branch", async () => {
    branches["travail-de-luc"] = [PATH];
    requests = [{ number: 4, branch: "travail-de-luc" }];

    const readAt = await inject(AuthoringService).loadForEditing("2026-060");

    expect(readAt.source.branch).toBe("travail-de-luc");
  });

  it("loads a scoping in progress from its branch, without a pull request", async () => {
    branches["cadrage/2026-060"] = [PATH];

    const readAt = await inject(AuthoringService).loadForEditing("2026-060");

    expect(readAt.source.branch).toBe("cadrage/2026-060");
    expect(readAt.source.sha).toBe("sha-cadrage/2026-060");
  });

  it("says that no branch carries a scoping not found", async () => {
    await expect(
      inject(AuthoringService).loadForEditing("2026-060"),
    ).rejects.toThrow(/aucune branche/);
  });
});
