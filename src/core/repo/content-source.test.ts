import { beforeEach, describe, expect, it, vi } from "vitest";
import { IDBFactory } from "fake-indexeddb";
import {
  HttpTestingController,
  provideHttpTesting,
} from "../http/http-testing";
import { inject, provide, resetInjection } from "../injection";
import { PLATFORM } from "../../platform/platform-token";
import { createWebPlatform } from "../../platform/web";
import type {
  ContentSource,
  SourceSnapshot,
  SourceUpdate,
} from "../../platform/ports";
import { GithubError } from "../github/github-client";
import { TokenService } from "../github/token.service";
import { INDEXEDDB_FACTORY } from "./content-cache";
import { RepoLoader } from "./repo-loader";

const REPO = { owner: "org", repo: "projet" };
const TOKEN = "ghp_abcdefghijklmnopqrst1234";

const RULE =
  "---\nid: RG-a\nfonctionnalites: []\nstatut: actif\n---\n\nTexte.\n";

/** A source holding one rule and a file the loader ignores, at commit `c1`. */
function snapshot(receivedAt = "2026-10-27T08:00:00.000Z"): SourceSnapshot {
  return {
    commit: "c1",
    receivedAt,
    entries: [
      { path: "rules", sha: "t1", type: "tree" },
      { path: "rules/RG-a.md", sha: "a1", type: "blob" },
      { path: "README.md", sha: "r1", type: "blob" },
    ],
  };
}

function fakeSource(update: SourceUpdate) {
  const contents = new Map([["a1", RULE]]);
  return {
    update: vi.fn(async () => update),
    read: vi.fn(async (_repo, shas: readonly string[]) =>
      shas.map((sha) => contents.get(sha) ?? ""),
    ),
    forgetRepo: vi.fn(async () => {}),
    forgetReadUnderToken: vi.fn(async () => {}),
  } satisfies ContentSource;
}

/**
 * The desktop reads the repo from the copy its native core keeps (RG-chargement-hors-quota, 2026-067): no tree through the API, no content through raw or blobs. What happens when the repo does not answer stays RG-dernier-etat-connu's.
 */
describe("reading through the platform's content source", () => {
  let http: HttpTestingController;

  function withSource(source: ContentSource): RepoLoader {
    resetInjection();
    provide(INDEXEDDB_FACTORY, new IDBFactory());
    provide(PLATFORM, { ...createWebPlatform(), contentSource: source });
    http = provideHttpTesting();
    return inject(RepoLoader);
  }

  beforeEach(() => resetInjection());

  it("reads the tree and the contents from the source, without calling GitHub", async () => {
    const source = fakeSource({ issue: "recu", snapshot: snapshot() });
    const loader = withSource(source);

    const read = await loader.readSpecification(REPO, { remember: true });

    expect([...read.specification.rules.keys()]).toEqual(["RG-a"]);
    expect(read.unconfirmed).toBeNull();
    expect(read.fingerprints).toEqual(new Set(["a1"]));
    expect(source.read).toHaveBeenCalledWith(REPO, ["a1"]);
    http.verify();
  });

  it("asks for HEAD by default, a branch when one is named, with the repo's token", async () => {
    const source = fakeSource({ issue: "recu", snapshot: snapshot() });
    const loader = withSource(source);
    inject(TokenService).setForScope("org", TOKEN);

    await loader.readSpecification(REPO);
    await loader.readSpecification({ ...REPO, ref: "cadrage-1" });

    expect(source.update).toHaveBeenNthCalledWith(1, REPO, "HEAD", TOKEN);
    expect(source.update).toHaveBeenNthCalledWith(
      2,
      { ...REPO, ref: "cadrage-1" },
      "cadrage-1",
      TOKEN,
    );
  });

  it("shows the last state received, marked, when the repo is unreachable", async () => {
    const known = snapshot("2026-10-26T18:30:00.000Z");
    const source = fakeSource({ issue: "echec", status: 0, known });
    const loader = withSource(source);

    const read = await loader.readSpecification(REPO, {
      lastKnownState: true,
    });

    expect([...read.specification.rules.keys()]).toEqual(["RG-a"]);
    expect(read.unconfirmed?.readAt).toBe("2026-10-26T18:30:00.000Z");
    expect(read.unconfirmed?.cause).toMatch(/injoignable/);
  });

  it("fails without a known state, or when the reader did not ask for one", async () => {
    const offline = fakeSource({ issue: "echec", status: 0, known: null });
    await expect(
      withSource(offline).readSpecification(REPO, { lastKnownState: true }),
    ).rejects.toBeInstanceOf(GithubError);

    const known = fakeSource({
      issue: "echec",
      status: 0,
      known: snapshot(),
    });
    await expect(withSource(known).readSpecification(REPO)).rejects.toThrow(
      /injoignable/,
    );
  });

  it("erases the copy when the platform refuses, and shows nothing of it", async () => {
    const source = fakeSource({
      issue: "echec",
      status: 401,
      known: snapshot(),
    });
    const loader = withSource(source);

    await expect(
      loader.readSpecification(REPO, { lastKnownState: true }),
    ).rejects.toBeInstanceOf(GithubError);
    expect(source.forgetRepo).toHaveBeenCalledWith(REPO);
  });

  it("erases the copies read under a token when the token is forgotten", () => {
    const source = fakeSource({ issue: "recu", snapshot: snapshot() });
    withSource(source);
    const tokens = inject(TokenService);
    tokens.setForScope("org", TOKEN);

    tokens.forgetScope("Org");
    expect(source.forgetReadUnderToken).toHaveBeenLastCalledWith("org");

    tokens.erase();
    expect(source.forgetReadUnderToken).toHaveBeenLastCalledWith(null);
  });
});
