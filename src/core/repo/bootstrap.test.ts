import { inject, provide, resetInjection } from "../injection";
import { describe, expect, it } from "vitest";
import { GithubClient } from "../github/github-client";
import { RepoConfig } from "./repo-config";
import { SpecificationStore } from "./specification.store";
import { BootstrapService } from "./bootstrap.service";

/**
 * L'amorçage d'un dépôt vide — RG-amorcage-depot, RG-statuts-cadrage.
 *
 * Le statut d'un cadrage se déduit du dépôt, et les opérations d'impact sont
 * fixes : les écrire dans `ssk-canon.yml` ferait passer pour réglable ce que
 * plus rien ne lit.
 */
describe("L’amorçage d’un dépôt", () => {
  it("n’écrit dans la configuration que ce qui se lit", async () => {
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
    // Une piste se cite depuis le cadrage qui la réalise (cadrage 2026-058).
    expect(config).toContain("  - piste\n");
    expect(config).not.toMatch(/^statuts:/m);
    expect(config).not.toMatch(/^operations:/m);
  });
});
