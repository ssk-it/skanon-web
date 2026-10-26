import {
  HttpTestingController,
  provideHttpTesting,
} from "../http/http-testing";
import { inject, provide, resetInjection } from "../injection";
import { beforeEach, describe, expect, it } from "vitest";
import { IDBFactory } from "fake-indexeddb";
import { ReferentielStore } from "./referentiel.store";
import { FABRIQUE_INDEXEDDB } from "./contenus-cache";

/**
 * RG-cadrages-en-cours-visibles : les cadrages en cours se trouvent par les
 * demandes de fusion ouvertes et par les branches. Un cadrage commencé n'a pas
 * encore de demande, et c'est précisément le brouillon.
 */
describe("les cadrages en cours, vus depuis le store", () => {
  const DEPOT = { owner: "org", repo: "projet" };
  const API = "https://api.github.com/repos/org/projet";
  const RAW = "https://raw.githubusercontent.com/org/projet";
  const PULLS = `${API}/pulls?state=open&per_page=100&sort=updated&direction=desc`;
  const BRANCHES = `${API}/git/matching-refs/heads/cadrage`;

  let http: HttpTestingController;
  let store: ReferentielStore;

  beforeEach(() => {
    resetInjection();
    provide(FABRIQUE_INDEXEDDB, new IDBFactory());
    http = provideHttpTesting();
    store = inject(ReferentielStore);
  });

  /** Répond à la requête dès qu'elle part, quel que soit l'ordre des appels. */
  async function repondre(url: string, corps: unknown): Promise<void> {
    for (let i = 0; i < 100; i++) {
      const enVol = http.match(url);
      if (enVol.length) {
        enVol[0].flush(corps);
        return;
      }
      await new Promise((r) => setTimeout(r, 0));
    }
    throw new Error(`Aucune requête vers ${url}`);
  }

  async function branchesLues(): Promise<void> {
    for (let i = 0; i < 100 && store.branchesEnChargement(); i++)
      await new Promise((r) => setTimeout(r, 0));
  }

  async function arbre(
    ref: string,
    commit: string,
    fichiers: Record<string, string>,
  ): Promise<void> {
    await repondre(`${API}/git/trees/${ref}?recursive=1`, {
      sha: commit,
      truncated: false,
      tree: Object.entries(fichiers).map(([path, sha]) => ({
        path,
        sha,
        type: "blob",
      })),
    });
  }

  async function principale(fichiers: Record<string, string>): Promise<void> {
    const chargement = store.loadReferentiel(DEPOT);
    await arbre("HEAD", "c1", fichiers);
    for (const chemin of Object.keys(fichiers)) {
      const id = chemin.split("/")[1];
      await repondre(
        `${RAW}/c1/${chemin}`,
        `---\nid: ${id}\ntitre: Livré ${id}\n---\n`,
      );
    }
    await chargement;
  }

  it("montre en brouillon le cadrage d’une branche sans demande de fusion", async () => {
    await principale({});
    await repondre(PULLS, []);
    await repondre(BRANCHES, [{ ref: "refs/heads/cadrage/2026-061" }]);
    await arbre("cadrage/2026-061", "c7", {
      "cadrages/2026-061/cadrage.md": "k7",
    });
    await repondre(
      `${RAW}/c7/cadrages/2026-061/cadrage.md`,
      "---\nid: 2026-061\ntitre: Commencé\n---\n",
    );
    await branchesLues();

    const c = store.referentiel().cadrages.get("2026-061");
    expect(c?.statut).toBe("brouillon");
    expect(c?.provenance?.branche).toBe("cadrage/2026-061");
    expect(c?.provenance?.pullRequest).toBeUndefined();
  });

  it("ne relit pas la branche d’une demande de fusion déjà lue", async () => {
    await principale({});
    await repondre(PULLS, [
      { number: 3, draft: false, head: { ref: "cadrage-2026-062" } },
    ]);
    await repondre(BRANCHES, [{ ref: "refs/heads/cadrage-2026-062" }]);
    await arbre("cadrage-2026-062", "c8", {
      "cadrages/2026-062/cadrage.md": "k8",
    });
    await repondre(
      `${RAW}/c8/cadrages/2026-062/cadrage.md`,
      "---\nid: 2026-062\ntitre: En relecture\n---\n",
    );
    await branchesLues();

    expect(store.referentiel().cadrages.get("2026-062")?.statut).toBe(
      "en_relecture",
    );
    http.verify();
  });

  it("signale sur un cadrage livré la branche qui l’a ajouté et lui survit", async () => {
    await principale({ "cadrages/2026-032/cadrage.md": "k2" });
    await repondre(PULLS, []);
    await repondre(BRANCHES, [{ ref: "refs/heads/cadrage-2026-032" }]);
    await arbre("cadrage-2026-032", "c9", {
      "cadrages/2026-032/cadrage.md": "k2",
    });
    await repondre(API, { default_branch: "main", description: null });
    await repondre(`${API}/compare/main...cadrage-2026-032`, {
      files: [{ filename: "cadrages/2026-032/cadrage.md", status: "added" }],
    });
    await branchesLues();

    const c = store.referentiel().cadrages.get("2026-032");
    expect(c?.statut).toBe("livree");
    expect(c?.branchesSurvivantes).toEqual(["cadrage-2026-032"]);
    http.verify();
  });

  it("ne compare pas à la principale une branche qui porte un cadrage en cours", async () => {
    await principale({ "cadrages/2026-032/cadrage.md": "k2" });
    await repondre(PULLS, []);
    await repondre(BRANCHES, [{ ref: "refs/heads/cadrage/2026-063" }]);
    await arbre("cadrage/2026-063", "c10", {
      "cadrages/2026-032/cadrage.md": "k2",
      "cadrages/2026-063/cadrage.md": "k3",
    });
    await repondre(
      `${RAW}/c10/cadrages/2026-063/cadrage.md`,
      "---\nid: 2026-063\ntitre: En cours\n---\n",
    );
    await branchesLues();

    expect(
      store.referentiel().cadrages.get("2026-032")?.branchesSurvivantes,
    ).toBeUndefined();
    http.verify();
  });
});
