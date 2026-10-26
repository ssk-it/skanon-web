import {
  HttpTestingController,
  provideHttpTesting,
} from "../http/http-testing";
import { inject, provide, resetInjection } from "../injection";
import { beforeEach, describe, expect, it } from "vitest";
import { IDBFactory } from "fake-indexeddb";
import { RepoLoader } from "./repo-loader";
import { INDEXEDDB_FACTORY } from "./content-cache";
import { GithubClient, GithubError } from "../github/github-client";
import { TokenService } from "../github/token.service";

/**
 * Each opening re-read everything: the tree, then each file, then
 * each scoping branch, re-read in full. On a private repo, each
 * file is a counted call — measured on `ssk-canon`, about eight hundred
 * and thirty per opening. See scoping 2026-043.
 *
 * Each case plays several visits on the same storage: `newVisit`
 * rebuilds the application, without the previous tab's memory.
 */
describe("content cache on loading", () => {
  const REPO = { owner: "org", repo: "projet" };
  const API = "https://api.github.com/repos/org/projet";
  const RAW = "https://raw.githubusercontent.com/org/projet";
  const RULE = (id: string) =>
    `---\nid: ${id}\nstatut: actif\n---\n\nUn énoncé.\n`;

  let factory: IDBFactory;
  let http: HttpTestingController;

  function newVisit(): RepoLoader {
    resetInjection();
    provide(INDEXEDDB_FACTORY, factory);
    http = provideHttpTesting();
    return inject(RepoLoader);
  }

  function tree(commit: string, files: Record<string, string>, ref = "HEAD") {
    http.expectOne(`${API}/git/trees/${ref}?recursive=1`).flush(
      {
        sha: commit,
        truncated: false,
        tree: Object.entries(files).map(([path, sha]) => ({
          path,
          sha,
          type: "blob",
        })),
      },
      { headers: { etag: `"${commit}"` } },
    );
  }

  /** Lets the queues and storage run before going on. */
  async function waitFor(): Promise<void> {
    for (let i = 0; i < 20; i++) await new Promise((r) => setTimeout(r, 0));
  }

  async function readAll(
    loader: RepoLoader,
    options = { remember: true, lastKnownState: true },
    ref?: string,
  ) {
    return loader.readSpecification(ref ? { ...REPO, ref } : REPO, options);
  }

  beforeEach(() => {
    factory = new IDBFactory();
  });

  it("does not request again, on the next visit, a file the machine holds", async () => {
    let loader = newVisit();
    let read = readAll(loader);
    tree("c1", { "rules/RG-a.md": "a1", "rules/RG-b.md": "b1" });
    await waitFor();
    http.expectOne(`${RAW}/c1/rules/RG-a.md`).flush(RULE("RG-a"));
    http.expectOne(`${RAW}/c1/rules/RG-b.md`).flush(RULE("RG-b"));
    await read;

    // One commit later, only RG-b has changed.
    loader = newVisit();
    read = readAll(loader);
    tree("c2", { "rules/RG-a.md": "a1", "rules/RG-b.md": "b2" });
    await waitFor();
    http.expectOne(`${RAW}/c2/rules/RG-b.md`).flush(RULE("RG-b"));
    const result = await read;

    expect([...result.specification.rules.keys()].sort()).toEqual([
      "RG-a",
      "RG-b",
    ]);
    expect(result.unconfirmed).toBeNull();
    http.verify();
  });

  it("shares the cache between the default branch and a scoping branch", async () => {
    const loader = newVisit();
    const main = readAll(loader);
    tree("c1", { "rules/RG-a.md": "a1" });
    await waitFor();
    http.expectOne(`${RAW}/c1/rules/RG-a.md`).flush(RULE("RG-a"));
    await main;

    const branch = readAll(
      loader,
      { remember: true, lastKnownState: false },
      "cadrage-2026-001",
    );
    tree(
      "c9",
      { "rules/RG-a.md": "a1", "cadrages/2026-001/cadrage.md": "k1" },
      "cadrage-2026-001",
    );
    await waitFor();
    // Only what the branch has of its own is requested.
    http
      .expectOne(`${RAW}/c9/cadrages/2026-001/cadrage.md`)
      .flush("---\nid: 2026-001\ntitre: Un cadrage\n---\n");
    const result = await branch;

    expect(result.fingerprints).toEqual(new Set(["a1", "k1"]));
    http.verify();
  });

  it("requests the tree conditionally when the user is signed in", async () => {
    let loader = newVisit();
    inject(TokenService).set("ghp_jetonDeTestSuffisammentLong");
    let read = readAll(loader);
    // Signed in, the known state is consulted before the tree request goes out.
    await waitFor();
    tree("c1", { "rules/RG-a.md": "a1" });
    await waitFor();
    http.expectOne(`${RAW}/c1/rules/RG-a.md`).flush(RULE("RG-a"));
    await read;

    loader = newVisit();
    inject(TokenService).set("ghp_jetonDeTestSuffisammentLong");
    read = readAll(loader);
    await waitFor();
    const conditional = http.expectOne(`${API}/git/trees/HEAD?recursive=1`);
    expect(conditional.request.headers.get("If-None-Match")).toBe('"c1"');
    // Unchanged: the platform counts nothing, and nothing else is requested.
    conditional.flush(null, { status: 304, statusText: "Not Modified" });
    const result = await read;

    expect(result.specification.rules.has("RG-a")).toBe(true);
    expect(result.unconfirmed).toBeNull();
    http.verify();
  });

  it("sets no condition when signed out, where it would be counted anyway", async () => {
    let loader = newVisit();
    let read = readAll(loader);
    tree("c1", { "rules/RG-a.md": "a1" });
    await waitFor();
    http.expectOne(`${RAW}/c1/rules/RG-a.md`).flush(RULE("RG-a"));
    await read;

    loader = newVisit();
    read = readAll(loader);
    await waitFor();
    const query = http.expectOne(`${API}/git/trees/HEAD?recursive=1`);
    expect(query.request.headers.has("If-None-Match")).toBe(false);
    query.flush({
      sha: "c1",
      truncated: false,
      tree: [{ path: "rules/RG-a.md", sha: "a1", type: "blob" }],
    });
    await read;
    http.verify();
  });

  it("shows the last read state, dated and marked, when the repo does not answer", async () => {
    let loader = newVisit();
    let read = readAll(loader);
    tree("c1", { "rules/RG-a.md": "a1" });
    await waitFor();
    http.expectOne(`${RAW}/c1/rules/RG-a.md`).flush(RULE("RG-a"));
    await read;

    loader = newVisit();
    read = readAll(loader);
    await waitFor();
    http
      .expectOne(`${API}/git/trees/HEAD?recursive=1`)
      .error(new ProgressEvent("error"));
    const result = await read;

    expect(result.specification.rules.has("RG-a")).toBe(true);
    expect(result.unconfirmed?.cause).toContain("injoignable");
    expect(Date.parse(result.unconfirmed!.readAt)).not.toBeNaN();
    http.verify();
  });

  it("fails rather than base a read made for writing on an unconfirmed state", async () => {
    let loader = newVisit();
    const read = readAll(loader);
    tree("c1", { "rules/RG-a.md": "a1" });
    await waitFor();
    http.expectOne(`${RAW}/c1/rules/RG-a.md`).flush(RULE("RG-a"));
    await read;

    loader = newVisit();
    const failure = loader.loadSpecification(REPO);
    await waitFor();
    http
      .expectOne(`${API}/git/trees/HEAD?recursive=1`)
      .error(new ProgressEvent("error"));
    await expect(failure).rejects.toBeInstanceOf(GithubError);
  });

  it("erases what it holds of a repo the platform refuses access to", async () => {
    let loader = newVisit();
    let read = readAll(loader);
    tree("c1", { "rules/RG-a.md": "a1" });
    await waitFor();
    http.expectOne(`${RAW}/c1/rules/RG-a.md`).flush(RULE("RG-a"));
    await read;

    loader = newVisit();
    read = readAll(loader);
    await waitFor();
    http
      .expectOne(`${API}/git/trees/HEAD?recursive=1`)
      .flush(
        { message: "Not Found" },
        { status: 404, statusText: "Not Found" },
      );
    await expect(read).rejects.toBeInstanceOf(GithubError);

    // Neither last known state nor content: everything is requested again.
    loader = newVisit();
    read = readAll(loader);
    await waitFor();
    http
      .expectOne(`${API}/git/trees/HEAD?recursive=1`)
      .error(new ProgressEvent("error"));
    await expect(read).rejects.toBeInstanceOf(GithubError);

    loader = newVisit();
    read = readAll(loader);
    tree("c1", { "rules/RG-a.md": "a1" });
    await waitFor();
    http.expectOne(`${RAW}/c1/rules/RG-a.md`).flush(RULE("RG-a"));
    await read;
    http.verify();
  });

  it("does not keep beyond the tab a private repo read under a temporary access", async () => {
    const readPrivate = async () => {
      const loader = newVisit();
      inject(TokenService).setAccess({
        token: "ghs_accesTemporaire",
        validUntil: new Date(Date.now() + 3_600_000).toISOString(),
        repos: ["org/projet"],
        identity: { identifier: "u", name: "U", email: null },
      });
      inject(GithubClient).useApiForContents(true);
      // Wrapped: returning the promise itself would make it wait here.
      const inProgress = { read: readAll(loader) };
      await waitFor();
      return inProgress;
    };

    let { read } = await readPrivate();
    tree("c1", { "rules/RG-a.md": "a1" });
    await waitFor();
    http.expectOne(`${API}/git/blobs/a1`).flush(RULE("RG-a"));
    await read;

    ({ read: read } = await readPrivate());
    // No known state, hence no condition; no content, hence requested again.
    const query = http.expectOne(`${API}/git/trees/HEAD?recursive=1`);
    expect(query.request.headers.has("If-None-Match")).toBe(false);
    query.flush({
      sha: "c1",
      truncated: false,
      tree: [{ path: "rules/RG-a.md", sha: "a1", type: "blob" }],
    });
    await waitFor();
    http.expectOne(`${API}/git/blobs/a1`).flush(RULE("RG-a"));
    await read;
    http.verify();
  });
});
