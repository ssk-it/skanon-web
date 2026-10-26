import {
  HttpTestingController,
  provideHttpTesting,
} from "../http/http-testing";
import { inject, provide, resetInjection } from "../injection";
import { beforeEach, describe, expect, it } from "vitest";
import { IDBFactory } from "fake-indexeddb";
import { SpecificationStore } from "./referentiel.store";
import { INDEXEDDB_FACTORY } from "./contenus-cache";

/**
 * RG-cadrages-en-cours-visibles : les cadrages en cours se trouvent par les
 * demandes de fusion ouvertes et par les branches. Un cadrage commencé n'a pas
 * encore de demande, et c'est précisément le brouillon.
 */
describe("les cadrages en cours, vus depuis le store", () => {
  const REPO = { owner: "org", repo: "projet" };
  const API = "https://api.github.com/repos/org/projet";
  const RAW = "https://raw.githubusercontent.com/org/projet";
  const PULLS = `${API}/pulls?state=open&per_page=100&sort=updated&direction=desc`;
  const BRANCHES = `${API}/git/matching-refs/heads/cadrage`;

  let http: HttpTestingController;
  let store: SpecificationStore;

  beforeEach(() => {
    resetInjection();
    provide(INDEXEDDB_FACTORY, new IDBFactory());
    http = provideHttpTesting();
    store = inject(SpecificationStore);
  });

  /** Répond à la requête dès qu'elle part, quel que soit l'ordre des appels. */
  async function respond(url: string, body: unknown): Promise<void> {
    for (let i = 0; i < 100; i++) {
      const inFlight = http.match(url);
      if (inFlight.length) {
        inFlight[0].flush(body);
        return;
      }
      await new Promise((r) => setTimeout(r, 0));
    }
    throw new Error(`Aucune requête vers ${url}`);
  }

  async function readBranches(): Promise<void> {
    for (let i = 0; i < 100 && store.loadingBranches(); i++)
      await new Promise((r) => setTimeout(r, 0));
  }

  async function tree(
    ref: string,
    commit: string,
    files: Record<string, string>,
  ): Promise<void> {
    await respond(`${API}/git/trees/${ref}?recursive=1`, {
      sha: commit,
      truncated: false,
      tree: Object.entries(files).map(([path, sha]) => ({
        path,
        sha,
        type: "blob",
      })),
    });
  }

  async function main(files: Record<string, string>): Promise<void> {
    const loading = store.loadSpecification(REPO);
    await tree("HEAD", "c1", files);
    for (const path of Object.keys(files)) {
      const id = path.split("/")[1];
      await respond(
        `${RAW}/c1/${path}`,
        `---\nid: ${id}\ntitre: Livré ${id}\n---\n`,
      );
    }
    await loading;
  }

  it("montre en brouillon le cadrage d’une branche sans demande de fusion", async () => {
    await main({});
    await respond(PULLS, []);
    await respond(BRANCHES, [{ ref: "refs/heads/cadrage/2026-061" }]);
    await tree("cadrage/2026-061", "c7", {
      "cadrages/2026-061/cadrage.md": "k7",
    });
    await respond(
      `${RAW}/c7/cadrages/2026-061/cadrage.md`,
      "---\nid: 2026-061\ntitre: Commencé\n---\n",
    );
    await readBranches();

    const c = store.specification().scopings.get("2026-061");
    expect(c?.status).toBe("brouillon");
    expect(c?.provenance?.branch).toBe("cadrage/2026-061");
    expect(c?.provenance?.pullRequest).toBeUndefined();
  });

  it("ne relit pas la branche d’une demande de fusion déjà lue", async () => {
    await main({});
    await respond(PULLS, [
      { number: 3, draft: false, head: { ref: "cadrage-2026-062" } },
    ]);
    await respond(BRANCHES, [{ ref: "refs/heads/cadrage-2026-062" }]);
    await tree("cadrage-2026-062", "c8", {
      "cadrages/2026-062/cadrage.md": "k8",
    });
    await respond(
      `${RAW}/c8/cadrages/2026-062/cadrage.md`,
      "---\nid: 2026-062\ntitre: En relecture\n---\n",
    );
    await readBranches();

    expect(store.specification().scopings.get("2026-062")?.status).toBe(
      "en_relecture",
    );
    http.verify();
  });

  it("signale sur un cadrage livré la branche qui l’a ajouté et lui survit", async () => {
    await main({ "cadrages/2026-032/cadrage.md": "k2" });
    await respond(PULLS, []);
    await respond(BRANCHES, [{ ref: "refs/heads/cadrage-2026-032" }]);
    await tree("cadrage-2026-032", "c9", {
      "cadrages/2026-032/cadrage.md": "k2",
    });
    await respond(API, { default_branch: "main", description: null });
    await respond(`${API}/compare/main...cadrage-2026-032`, {
      files: [{ filename: "cadrages/2026-032/cadrage.md", status: "added" }],
    });
    await readBranches();

    const c = store.specification().scopings.get("2026-032");
    expect(c?.status).toBe("livree");
    expect(c?.staleBranches).toEqual(["cadrage-2026-032"]);
    http.verify();
  });

  it("ne compare pas à la principale une branche qui porte un cadrage en cours", async () => {
    await main({ "cadrages/2026-032/cadrage.md": "k2" });
    await respond(PULLS, []);
    await respond(BRANCHES, [{ ref: "refs/heads/cadrage/2026-063" }]);
    await tree("cadrage/2026-063", "c10", {
      "cadrages/2026-032/cadrage.md": "k2",
      "cadrages/2026-063/cadrage.md": "k3",
    });
    await respond(
      `${RAW}/c10/cadrages/2026-063/cadrage.md`,
      "---\nid: 2026-063\ntitre: En cours\n---\n",
    );
    await readBranches();

    expect(
      store.specification().scopings.get("2026-032")?.staleBranches,
    ).toBeUndefined();
    http.verify();
  });
});
