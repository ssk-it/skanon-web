import {
  HttpTestingController,
  provideHttpTesting,
} from "../http/http-testing";
import { inject, provide, resetInjection } from "../injection";
import { beforeEach, describe, expect, it } from "vitest";
import { IDBFactory } from "fake-indexeddb";
import { ReferentielStore } from "./referentiel.store";
import { ContenusCache, FABRIQUE_INDEXEDDB } from "./contenus-cache";
import { GithubClient, GithubError } from "../github/github-client";

/**
 * RG-dernier-etat-connu et RG-contenus-par-empreinte, vus depuis le store :
 * ce qu'on affiche quand le dépôt ne répond pas, et ce que le cache garde une
 * fois la branche principale et les branches de cadrage lues.
 */
describe("dernier état connu et retrait du cache", () => {
  const DEPOT = { owner: "org", repo: "projet" };
  const API = "https://api.github.com/repos/org/projet";
  const RAW = "https://raw.githubusercontent.com/org/projet";
  const PULLS = `${API}/pulls?state=open&per_page=100&sort=updated&direction=desc`;
  const BRANCHES = `${API}/git/matching-refs/heads/cadrage`;

  let fabrique: IDBFactory;
  let http: HttpTestingController;
  let store: ReferentielStore;

  function nouvelleVisite(): void {
    resetInjection();
    provide(FABRIQUE_INDEXEDDB, fabrique);
    http = provideHttpTesting();
    store = inject(ReferentielStore);
  }

  async function attendre(): Promise<void> {
    for (let i = 0; i < 30; i++) await new Promise((r) => setTimeout(r, 0));
  }

  function arbre(
    ref: string,
    commit: string,
    fichiers: Record<string, string>,
  ): void {
    http.expectOne(`${API}/git/trees/${ref}?recursive=1`).flush({
      sha: commit,
      truncated: false,
      tree: Object.entries(fichiers).map(([path, sha]) => ({
        path,
        sha,
        type: "blob",
      })),
    });
  }

  /** Une première visite : la principale, puis une branche de cadrage ouverte. */
  async function premiereVisite(): Promise<void> {
    nouvelleVisite();
    const chargement = store.loadReferentiel(DEPOT);
    arbre("HEAD", "c1", { "rules/RG-a.md": "a1" });
    await attendre();
    http
      .expectOne(`${RAW}/c1/rules/RG-a.md`)
      .flush("---\nid: RG-a\nstatut: actif\n---\n");
    await chargement;
    await attendre();

    http
      .expectOne(PULLS)
      .flush([{ number: 7, draft: false, head: { ref: "cadrage-1" } }]);
    await attendre();
    http.expectOne(BRANCHES).flush([{ ref: "refs/heads/cadrage-1" }]);
    await attendre();
    arbre("cadrage-1", "c9", {
      "rules/RG-a.md": "a1",
      "cadrages/2026-001/cadrage.md": "k1",
    });
    await attendre();
    http
      .expectOne(`${RAW}/c9/cadrages/2026-001/cadrage.md`)
      .flush("---\nid: 2026-001\ntitre: Un cadrage\n---\n");
    await attendre();
  }

  beforeEach(() => {
    fabrique = new IDBFactory();
  });

  it("affiche le dernier état lu, et refuse d’y écrire, quand le dépôt ne répond pas", async () => {
    await premiereVisite();

    nouvelleVisite();
    const chargement = store.loadReferentiel(DEPOT);
    http
      .expectOne(`${API}/git/trees/HEAD?recursive=1`)
      .error(new ProgressEvent("error"));
    await chargement;

    expect(store.etat()).toBe("pret");
    expect(store.findRegle("RG-a")).toBeTruthy();
    expect(store.nonConfirme()?.cause).toContain("injoignable");

    // L'écriture est refusée avant même de partir.
    const github = inject(GithubClient);
    await expect(
      github.createBranche(DEPOT, "cadrage-2", "c1"),
    ).rejects.toBeInstanceOf(GithubError);
    http.verify();
  });

  it("lève la marque et rouvre l’écriture dès que le dépôt répond", async () => {
    await premiereVisite();

    nouvelleVisite();
    let chargement = store.loadReferentiel(DEPOT);
    http
      .expectOne(`${API}/git/trees/HEAD?recursive=1`)
      .error(new ProgressEvent("error"));
    await chargement;
    expect(store.nonConfirme()).not.toBeNull();

    chargement = store.loadReferentiel(DEPOT);
    arbre("HEAD", "c1", { "rules/RG-a.md": "a1" });
    await chargement;

    expect(store.nonConfirme()).toBeNull();
    expect(inject(GithubClient).ecritureSuspendue()).toBeNull();
  });

  it("retire ce que seule une branche refermée citait", async () => {
    await premiereVisite();

    nouvelleVisite();
    const chargement = store.loadReferentiel(DEPOT);
    arbre("HEAD", "c2", { "rules/RG-a.md": "a1" });
    await chargement;
    await attendre();
    http.expectOne(PULLS).flush([]);
    await attendre();
    http.expectOne(BRANCHES).flush([]);
    await attendre();

    const cache = inject(ContenusCache);
    expect(await cache.loadContenu(DEPOT, "a1")).not.toBeNull();
    expect(await cache.loadContenu(DEPOT, "k1")).toBeNull();
    expect(await cache.loadEtat(DEPOT, "cadrage-1")).toBeNull();
    http.verify();
  });
});
