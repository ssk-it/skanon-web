import { inject, provide, resetInjection } from "../injection";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { GithubClient, GithubError, RepoRef } from "../github/github-client";
import { SpecificationStore } from "./specification.store";
import { load } from "js-yaml";
import {
  AutomationRefused,
  AutomationService,
  WORKFLOW_PATHS,
} from "./automation.service";

/**
 * The automation of a scoping repo: two workflows that check a scoping before it
 * is delivered and propagate its impacts after.
 *
 * Whether it is in place is read from what the workflows call, not from their
 * names — a repo equipped by hand named them otherwise, and the first version,
 * looking for names, offered to install what was there and then duplicated it.
 */

const REPO = { owner: "org", repo: "projet" };

/** What these tests read of an installed workflow. */
interface Workflow {
  readonly on: Record<string, unknown>;
  readonly permissions?: Record<string, string>;
  readonly jobs: Record<
    string,
    {
      readonly "runs-on": unknown;
      readonly steps: ReadonlyArray<{
        readonly uses?: string;
        readonly with?: Record<string, unknown>;
      }>;
    }
  >;
}

let files: Record<string, string>;
let treeFails: boolean;
let commitFails: GithubError | null;
let commits: Array<{ branch: string; path: string; content: string }>;
const reload = vi.fn(async () => undefined);

beforeEach(() => {
  files = {};
  treeFails = false;
  commitFails = null;
  commits = [];
  reload.mockClear();
  resetInjection();
  provide(SpecificationStore, {
    repoRef: () => REPO,
    loadSpecification: reload,
  });
  provide(GithubClient, {
    loadRepo: async () => ({ defaultBranch: "principale", description: null }),
    loadTree: async () => {
      if (treeFails) throw new GithubError("indisponible", 502);
      return {
        sha: "racine",
        truncated: false,
        entries: Object.keys(files).map((path) => ({
          path,
          sha: path,
          type: "blob" as const,
        })),
      };
    },
    loadBlob: async (_r: RepoRef, sha: string) => files[sha],
    commitFile: async (
      _r: RepoRef,
      branch: string,
      path: string,
      content: string,
    ) => {
      if (commitFails) throw commitFails;
      commits.push({ branch, path, content });
      return { commit: "c", file: "f" };
    },
  });
});

describe("Checking the automation", () => {
  it("knows nothing until it has asked", () => {
    expect(inject(AutomationService).installed()).toBeNull();
  });

  it("finds it under any name, by the action a workflow calls", async () => {
    files[".github/workflows/controles.yaml"] =
      "jobs:\n  v:\n    steps:\n      - uses: ssk-it/ssk-canon-action/verifier@v2\n";
    const automation = inject(AutomationService);

    await automation.check();

    expect(automation.installed()).toBe(true);
  });

  it("does not find it in a workflow that calls something else, nor outside the workflows folder", async () => {
    files[".github/workflows/verification-depot-cadre.yml"] =
      "jobs:\n  v:\n    steps:\n      - uses: actions/checkout@v7\n";
    files["docs/ssk-canon-action.yml"] = "uses: ssk-it/ssk-canon-action";
    files[".github/workflows/notes.md"] = "ssk-it/ssk-canon-action";
    const automation = inject(AutomationService);

    await automation.check();

    expect(automation.installed()).toBe(false);
  });

  it("asserts nothing when the repo cannot be read", async () => {
    treeFails = true;
    const automation = inject(AutomationService);
    automation.installed.set(false);

    await automation.check();

    expect(automation.installed()).toBeNull();
  });
});

describe("Installing the automation", () => {
  it("writes both workflows on the default branch, then reloads the specification", async () => {
    const automation = inject(AutomationService);

    await automation.install();

    expect(commits.map((c) => [c.branch, c.path])).toEqual(
      WORKFLOW_PATHS.map((p) => ["principale", p]),
    );
    for (const c of commits)
      expect(c.content).toContain("ssk-it/ssk-canon-action");
    expect(automation.installed()).toBe(true);
    expect(reload).toHaveBeenCalledTimes(1);
  });

  // 2026-10-27: a private repo's minutes on GitHub's runners are paid, and a propagation pull request opened by the workflow token triggers no verification on its own.
  it("writes the workflows the action ships: the private runner, a verification the propagation can start, a propagation that commits", async () => {
    await inject(AutomationService).install();
    const [verification, propagation] = commits.map(
      (c) => load(c.content) as Workflow,
    );
    const runner =
      "${{ vars.SSK_RUNNER_PRIVE && fromJSON(vars.SSK_RUNNER_PRIVE) || 'ubuntu-latest' }}";

    for (const workflow of [verification, propagation])
      for (const job of Object.values(workflow.jobs))
        expect(job["runs-on"]).toBe(runner);
    expect(Object.keys(verification.on)).toContain("workflow_dispatch");
    expect(propagation.permissions).toMatchObject({
      contents: "write",
      "pull-requests": "write",
      actions: "write",
    });
    const step = propagation.jobs.propager.steps.find((s) =>
      String(s.uses).startsWith("ssk-it/ssk-canon-action"),
    );
    expect(step?.with).toMatchObject({ appliquer: "true", commiter: "true" });
  });

  it("names the missing workflow permission on a 403", async () => {
    commitFails = new GithubError("Forbidden", 403);
    const automation = inject(AutomationService);

    await expect(automation.install()).rejects.toThrow(AutomationRefused);
    expect(automation.installed()).toBeNull();
    expect(reload).not.toHaveBeenCalled();
  });

  it("passes any other failure on as it came", async () => {
    commitFails = new GithubError("Bad gateway", 502);

    const error = await inject(AutomationService)
      .install()
      .catch((e: unknown) => e);

    expect(error).toBe(commitFails);
  });
});
