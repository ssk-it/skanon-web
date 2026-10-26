import { inject, provide, resetInjection } from "../injection";
import { describe, expect, it } from "vitest";
import { GithubClient } from "../github/github-client";
import { RepoConfig } from "./repo-config";
import { SpecificationStore } from "./specification.store";
import { BootstrapService } from "./bootstrap.service";

/**
 * Bootstrapping an empty repo — RG-amorcage-depot, RG-statuts-cadrage.
 *
 * A scoping's status is derived from the repo, and impact operations are
 * fixed: writing them in `ssk-canon.yml` would pass off as configurable what
 * nothing reads any more.
 */
describe("Bootstrapping a repo", () => {
  it("only writes to the configuration what is read", async () => {
    const written = new Map<string, string>();
    resetInjection();
    provide(GithubClient, {
      loadRepo: async () => ({ defaultBranch: "main", description: null }),
      commitFile: async (
        _repo: unknown,
        _branch: string,
        path: string,
        content: string,
      ) => {
        written.set(path, content);
        return { commit: "c", file: "f" };
      },
    });
    provide(SpecificationStore, {
      repoRef: () => ({ owner: "org", repo: "depot" }),
      loadSpecification: async () => undefined,
    });
    inject(RepoConfig).saveRepo({ owner: "org", repo: "depot" });

    await inject(BootstrapService).bootstrapProject({
      name: "Essai",
      description: "",
    });

    const config = written.get("ssk-canon.yml") ?? "";
    expect(config).toContain("nom: Essai");
    expect(config).toContain("tags_liens:");
    // A roadmap item is cited from the scoping that carries it out (scoping 2026-058).
    expect(config).toContain("  - piste\n");
    expect(config).not.toMatch(/^statuts:/m);
    expect(config).not.toMatch(/^operations:/m);
  });
});
