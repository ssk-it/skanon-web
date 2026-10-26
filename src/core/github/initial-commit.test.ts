import {
  HttpTestingController,
  provideHttpTesting,
  settle,
} from "../http/http-testing";
import { inject, resetInjection } from "../injection";
import { beforeEach, describe, expect, it } from "vitest";
import { GithubClient, GithubError } from "./github-client";

/**
 * RG-amorcage-depot: the structure of a new specification leaves in a single
 * commit, the first of the repo. The platform refuses its low-level calls on
 * an empty repo, so a first file opens the branch, and a root commit carrying
 * the whole structure then replaces it.
 */
describe("The initial commit of an empty repo", () => {
  const REPO = { owner: "org", repo: "projet" };
  const API = "https://api.github.com/repos/org/projet";
  const FILES = [
    { path: "ssk-canon.yml", content: "projet:\n  nom: Essai\n" },
    { path: "regles/README.md", content: "# Règles\n" },
  ];

  let http: HttpTestingController;
  let client: GithubClient;

  beforeEach(() => {
    resetInjection();
    http = provideHttpTesting();
    client = inject(GithubClient);
  });

  it("writes every file in one root commit, which replaces the opening one", async () => {
    const writing = client.commitInitialTree(REPO, "main", FILES, "Amorce");
    await settle();
    const opening = http.expectOne(`${API}/contents/ssk-canon.yml`);
    expect(opening.request.method).toBe("PUT");
    opening.flush({ commit: { sha: "c1" }, content: { sha: "f1" } });
    await settle();

    const tree = http.expectOne(`${API}/git/trees`);
    expect(tree.request.body).toEqual({
      tree: FILES.map((f) => ({
        path: f.path,
        mode: "100644",
        type: "blob",
        content: f.content,
      })),
    });
    tree.flush({ sha: "t" });
    await settle();

    const commit = http.expectOne(`${API}/git/commits`);
    expect(commit.request.body).toMatchObject({
      message: "Amorce",
      tree: "t",
      parents: [],
    });
    commit.flush({ sha: "c" });
    await settle();

    const ref = http.expectOne(`${API}/git/refs/heads/main`);
    expect(ref.request.method).toBe("PATCH");
    expect(ref.request.body).toEqual({ sha: "c", force: true });
    ref.flush({});

    expect(await writing).toBe("c");
    http.verify();
  });

  it("stops at the first refusal, naming the missing right", async () => {
    const writing = client
      .commitInitialTree(REPO, "main", FILES, "Amorce")
      .catch((e: unknown) => e);
    await settle();
    http
      .expectOne(`${API}/contents/ssk-canon.yml`)
      .error({ message: "Resource not accessible" }, { status: 403 });

    const error = (await writing) as GithubError;
    expect(error).toBeInstanceOf(GithubError);
    expect(error.status).toBe(403);
    http.verify();
  });
});

describe("What the repo's metadata says of the access", () => {
  const REPO = { owner: "org", repo: "projet" };

  beforeEach(() => resetInjection());

  it("tells whether the access may write", async () => {
    const http = provideHttpTesting();
    const reading = inject(GithubClient).loadRepo(REPO);
    await settle();
    http.expectOne("https://api.github.com/repos/org/projet").flush({
      default_branch: "main",
      description: null,
      permissions: { push: false },
    });
    expect((await reading).canWrite).toBe(false);
  });

  it("does not assert a right the platform did not state", async () => {
    const http = provideHttpTesting();
    const reading = inject(GithubClient).loadRepo(REPO);
    await settle();
    http
      .expectOne("https://api.github.com/repos/org/projet")
      .flush({ default_branch: "main", description: null });
    expect((await reading).canWrite).toBeNull();
  });
});

describe("Whether a repo is empty", () => {
  const REPO = { owner: "org", repo: "projet" };
  const URL = "https://api.github.com/repos/org/projet/commits?per_page=1";

  beforeEach(() => resetInjection());

  it("is empty when the platform says it has no commit", async () => {
    const http = provideHttpTesting();
    const asking = inject(GithubClient).isEmptyRepo(REPO);
    await settle();
    http
      .expectOne(URL)
      .error({ message: "Git Repository is empty." }, { status: 409 });
    expect(await asking).toBe(true);
  });

  it("is not empty as soon as it has a commit", async () => {
    const http = provideHttpTesting();
    const asking = inject(GithubClient).isEmptyRepo(REPO);
    await settle();
    http.expectOne(URL).flush([{ sha: "c" }]);
    expect(await asking).toBe(false);
  });

  it("lets any other failure through", async () => {
    const http = provideHttpTesting();
    const asking = inject(GithubClient)
      .isEmptyRepo(REPO)
      .catch((e: unknown) => e);
    await settle();
    http.expectOne(URL).error({}, { status: 404 });
    expect(((await asking) as GithubError).status).toBe(404);
  });
});
