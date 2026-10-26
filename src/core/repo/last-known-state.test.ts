import {
  HttpTestingController,
  provideHttpTesting,
} from "../http/http-testing";
import { inject, provide, resetInjection } from "../injection";
import { beforeEach, describe, expect, it } from "vitest";
import { IDBFactory } from "fake-indexeddb";
import { SpecificationStore } from "./specification.store";
import { ContentCache, INDEXEDDB_FACTORY } from "./content-cache";
import { GithubClient, GithubError } from "../github/github-client";
import { LocaleService } from "../i18n/locale.service";

/**
 * RG-dernier-etat-connu and RG-contenus-par-empreinte, seen from the store:
 * what is shown when the repo does not answer, and what the cache keeps once
 * the default branch and the scoping branches have been read.
 */
describe("last known state and removal from the cache", () => {
  const REPO = { owner: "org", repo: "projet" };
  const API = "https://api.github.com/repos/org/projet";
  const RAW = "https://raw.githubusercontent.com/org/projet";
  const PULLS = `${API}/pulls?state=open&per_page=100&sort=updated&direction=desc`;
  const BRANCHES = `${API}/git/matching-refs/heads/cadrage`;

  let factory: IDBFactory;
  let http: HttpTestingController;
  let store: SpecificationStore;

  function newVisit(): void {
    resetInjection();
    provide(INDEXEDDB_FACTORY, factory);
    http = provideHttpTesting();
    store = inject(SpecificationStore);
  }

  async function waitFor(): Promise<void> {
    for (let i = 0; i < 30; i++) await new Promise((r) => setTimeout(r, 0));
  }

  function tree(
    ref: string,
    commit: string,
    files: Record<string, string>,
  ): void {
    http.expectOne(`${API}/git/trees/${ref}?recursive=1`).flush({
      sha: commit,
      truncated: false,
      tree: Object.entries(files).map(([path, sha]) => ({
        path,
        sha,
        type: "blob",
      })),
    });
  }

  /** A first visit: the default branch, then an open scoping branch. */
  async function firstVisit(): Promise<void> {
    newVisit();
    const loading = store.loadSpecification(REPO);
    tree("HEAD", "c1", { "rules/RG-a.md": "a1" });
    await waitFor();
    http
      .expectOne(`${RAW}/c1/rules/RG-a.md`)
      .flush("---\nid: RG-a\nstatut: actif\n---\n");
    await loading;
    await waitFor();

    http
      .expectOne(PULLS)
      .flush([{ number: 7, draft: false, head: { ref: "cadrage-1" } }]);
    await waitFor();
    http.expectOne(BRANCHES).flush([{ ref: "refs/heads/cadrage-1" }]);
    await waitFor();
    tree("cadrage-1", "c9", {
      "rules/RG-a.md": "a1",
      "cadrages/2026-001/cadrage.md": "k1",
    });
    await waitFor();
    http
      .expectOne(`${RAW}/c9/cadrages/2026-001/cadrage.md`)
      .flush("---\nid: 2026-001\ntitre: Un cadrage\n---\n");
    await waitFor();
  }

  beforeEach(() => {
    factory = new IDBFactory();
  });

  it("shows the last read state, and refuses to write to it, when the repo does not answer", async () => {
    await firstVisit();

    newVisit();
    const loading = store.loadSpecification(REPO);
    http
      .expectOne(`${API}/git/trees/HEAD?recursive=1`)
      .error(new ProgressEvent("error"));
    await loading;

    expect(store.state()).toBe("pret");
    expect(store.findRule("RG-a")).toBeTruthy();
    expect(store.unconfirmed()?.cause).toContain("injoignable");

    // The write is refused before it even goes out.
    const github = inject(GithubClient);
    await expect(
      github.createBranch(REPO, "cadrage-2", "c1"),
    ).rejects.toBeInstanceOf(GithubError);
    http.verify();
  });

  it("says in English why writing is refused, when the repo does not answer", async () => {
    await firstVisit();

    newVisit();
    inject(LocaleService).choice.set("en");
    const loading = store.loadSpecification(REPO);
    http
      .expectOne(`${API}/git/trees/HEAD?recursive=1`)
      .error(new ProgressEvent("error"));
    await loading;

    expect(store.unconfirmed()?.cause).toContain("GitHub is unreachable");
    expect(inject(GithubClient).writeSuspended()).toContain(
      "The repo is not answering",
    );
  });

  it("lifts the mark and reopens writing as soon as the repo answers", async () => {
    await firstVisit();

    newVisit();
    let loading = store.loadSpecification(REPO);
    http
      .expectOne(`${API}/git/trees/HEAD?recursive=1`)
      .error(new ProgressEvent("error"));
    await loading;
    expect(store.unconfirmed()).not.toBeNull();

    loading = store.loadSpecification(REPO);
    tree("HEAD", "c1", { "rules/RG-a.md": "a1" });
    await loading;

    expect(store.unconfirmed()).toBeNull();
    expect(inject(GithubClient).writeSuspended()).toBeNull();
  });

  it("removes what only a closed branch cited", async () => {
    await firstVisit();

    newVisit();
    const loading = store.loadSpecification(REPO);
    tree("HEAD", "c2", { "rules/RG-a.md": "a1" });
    await loading;
    await waitFor();
    http.expectOne(PULLS).flush([]);
    await waitFor();
    http.expectOne(BRANCHES).flush([]);
    await waitFor();

    const cache = inject(ContentCache);
    expect(await cache.loadContent(REPO, "a1")).not.toBeNull();
    expect(await cache.loadContent(REPO, "k1")).toBeNull();
    expect(await cache.loadState(REPO, "cadrage-1")).toBeNull();
    http.verify();
  });
});
