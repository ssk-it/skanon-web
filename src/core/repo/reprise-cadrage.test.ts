import { inject, provide, resetInjection } from "../injection";
import { beforeEach, describe, expect, it } from "vitest";
import { GithubClient, GithubError } from "../github/github-client";
import { RepoConfig } from "./repo-config";
import { RedactionService } from "./redaction.service";

/**
 * Reprendre un cadrage — RG-cadrage-livre-immuable et
 * RG-cadrages-en-cours-visibles.
 *
 * Un cadrage que la branche principale porte est livré, et ne se modifie plus :
 * le charger depuis elle pour y écrire directement contournerait la
 * vérification. Un cadrage en cours, lui, se reprend depuis sa branche, qu'une
 * demande de fusion la porte ou non encore.
 */
describe("Reprendre un cadrage", () => {
  const CHEMIN = "cadrages/2026-060/cadrage.md";
  const CONTENU = "---\nid: 2026-060\ntitre: Un cadrage\n---\n";

  /** Ce que porte chaque branche du dépôt, par chemin. */
  let branches: Record<string, string[]>;
  let demandes: Array<{ numero: number; branche: string }>;

  beforeEach(() => {
    branches = { main: [] };
    demandes = [];
    resetInjection();
    provide(GithubClient, {
      loadDepot: async () => ({ defaultBranch: "main", description: null }),
      listPullRequestsOuvertes: async () =>
        demandes.map((d) => ({ ...d, brouillon: false, approbation: null })),
      listBranchesCadrage: async () =>
        Object.keys(branches).filter((b) => /^cadrage[-/]/.test(b)),
      loadFichierEditable: async (
        _depot: unknown,
        chemin: string,
        branche: string,
      ) => {
        if (!branches[branche]?.includes(chemin))
          throw new GithubError("Dépôt ou fichier introuvable.", 404);
        return { contenu: CONTENU, sha: `sha-${branche}` };
      },
      loadArbre: async () => {
        throw new GithubError("hors du sujet", 0);
      },
    });
    inject(RepoConfig).saveDepot({ owner: "org", repo: "depot" });
  });

  it("refuse un cadrage livré, et dit de passer par un nouveau cadrage", async () => {
    branches.main = [CHEMIN];

    await expect(
      inject(RedactionService).loadPourEdition("2026-060"),
    ).rejects.toThrow(/livré.*nouveau cadrage/s);
  });

  it("refuse un cadrage livré même quand une branche le porte encore", async () => {
    branches.main = [CHEMIN];
    branches["cadrage-2026-060"] = [CHEMIN];
    demandes = [{ numero: 4, branche: "cadrage-2026-060" }];

    await expect(
      inject(RedactionService).loadPourEdition("2026-060"),
    ).rejects.toThrow(/livré/);
  });

  it("charge un cadrage en cours depuis la branche de sa demande de fusion", async () => {
    branches["travail-de-luc"] = [CHEMIN];
    demandes = [{ numero: 4, branche: "travail-de-luc" }];

    const lu = await inject(RedactionService).loadPourEdition("2026-060");

    expect(lu.source.branche).toBe("travail-de-luc");
  });

  it("charge un cadrage en cours depuis sa branche, sans demande de fusion", async () => {
    branches["cadrage/2026-060"] = [CHEMIN];

    const lu = await inject(RedactionService).loadPourEdition("2026-060");

    expect(lu.source.branche).toBe("cadrage/2026-060");
    expect(lu.source.sha).toBe("sha-cadrage/2026-060");
  });

  it("dit qu’aucune branche ne porte un cadrage introuvable", async () => {
    await expect(
      inject(RedactionService).loadPourEdition("2026-060"),
    ).rejects.toThrow(/aucune branche/);
  });
});
