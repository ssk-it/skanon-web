import { inject, provide, resetInjection } from "../injection";
import { describe, expect, it } from "vitest";
import { GithubClient } from "../github/github-client";
import { RepoConfig } from "./repo-config";
import { ReferentielStore } from "./referentiel.store";
import { AmorcageService } from "./amorcage.service";

/**
 * L'amorçage d'un dépôt vide — RG-amorcage-depot, RG-statuts-cadrage.
 *
 * Le statut d'un cadrage se déduit du dépôt, et les opérations d'impact sont
 * fixes : les écrire dans `ssk-canon.yml` ferait passer pour réglable ce que
 * plus rien ne lit.
 */
describe("L’amorçage d’un dépôt", () => {
  it("n’écrit dans la configuration que ce qui se lit", async () => {
    const ecrits = new Map<string, string>();
    resetInjection();
    provide(GithubClient, {
      loadDepot: async () => ({ defaultBranch: "main", description: null }),
      commitFichier: async (
        _depot: unknown,
        _branche: string,
        chemin: string,
        contenu: string,
      ) => {
        ecrits.set(chemin, contenu);
        return { commit: "c", fichier: "f" };
      },
    });
    provide(ReferentielStore, {
      depot: () => ({ owner: "org", repo: "depot" }),
      loadReferentiel: async () => undefined,
    });
    inject(RepoConfig).saveDepot({ owner: "org", repo: "depot" });

    await inject(AmorcageService).amorcer({ nom: "Essai", description: "" });

    const config = ecrits.get("ssk-canon.yml") ?? "";
    expect(config).toContain("nom: Essai");
    expect(config).toContain("tags_liens:");
    // Une piste se cite depuis le cadrage qui la réalise (cadrage 2026-058).
    expect(config).toContain("  - piste\n");
    expect(config).not.toMatch(/^statuts:/m);
    expect(config).not.toMatch(/^operations:/m);
  });
});
