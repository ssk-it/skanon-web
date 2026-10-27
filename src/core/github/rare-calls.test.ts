import {
  HttpTestingController,
  provideHttpTesting,
} from "../http/http-testing";
import { inject, resetInjection } from "../injection";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { GithubClient, GithubError, GraphqlError } from "./github-client";
import { TokenService } from "./token.service";
import { githubText } from "./github.messages";

/**
 * The GitHub calls the application makes rarely — a status toggle, a pull request
 * opened, a decision deleted, a date bound, a token tried — and the errors each
 * one must name.
 *
 * Rare is not minor: each is the only path to what it does, and an error reported
 * under the wrong name sends the author looking elsewhere — a quota where a sign-in
 * is missing, an empty repo where a reload is needed.
 */

const REPO = { owner: "org", repo: "projet" };
const API = "https://api.github.com";
const REPO_API = `${API}/repos/org/projet`;
const GRAPHQL = `${API}/graphql`;

let http: HttpTestingController;
let client: GithubClient;

beforeEach(() => {
  resetInjection();
  http = provideHttpTesting();
  client = inject(GithubClient);
});

/** Lets the call reach the fake: it goes through the rate limiter's queue first. */
async function settle(): Promise<void> {
  for (let i = 0; i < 10; i++) await new Promise((r) => setTimeout(r, 0));
}

function signIn(): void {
  inject(TokenService).set("ghp_jetonDeTestSuffisammentLong");
}

/** The rejection of a call, to inspect it. */
function failure(call: Promise<unknown>): Promise<unknown> {
  return call.then(
    () => {
      throw new Error("l’appel devait échouer");
    },
    (e: unknown) => e,
  );
}

describe("A GraphQL query", () => {
  it("is refused without a token, before any request: GraphQL takes no anonymous call", async () => {
    const error = await failure(client.graphql("{ viewer { login } }", {}));

    expect(error).toBeInstanceOf(GithubError);
    expect((error as GithubError).message).toBe(
      githubText().historyRequiresSignIn,
    );
    http.verify();
  });

  it("returns the data of the answer, the query and variables posted as is", async () => {
    signIn();
    const call = client.graphql<{ n: number }>("query($a:Int!){ n }", {
      a: 1,
    });
    await settle();
    const request = http.expectOne(GRAPHQL);
    request.flush({ data: { n: 42 } });

    expect(await call).toEqual({ n: 42 });
    expect(request.request.method).toBe("POST");
    expect(request.request.body).toEqual({
      query: "query($a:Int!){ n }",
      variables: { a: 1 },
    });
  });

  it.each([
    ["NOT_FOUND", () => githubText().graphqlNotFound],
    ["RATE_LIMITED", () => githubText().graphqlRateLimited],
    ["FORBIDDEN", () => githubText().graphqlForbidden],
  ])("names a %s error in its own words", async (type, message) => {
    signIn();
    const call = failure(client.graphql("{ x }", {}));
    await settle();
    http
      .expectOne(GRAPHQL)
      .flush({ data: null, errors: [{ type, message: "brut" }] });

    const error = (await call) as GraphqlError;
    expect(error).toBeInstanceOf(GraphqlError);
    expect(error.message).toBe(message());
  });

  it("passes on the message of an error it does not know", async () => {
    signIn();
    const call = failure(client.graphql("{ x }", {}));
    await settle();
    http.expectOne(GRAPHQL).flush({
      errors: [{ type: "SOMETHING_NEW", message: "Ce que GitHub a dit." }],
    });

    expect(((await call) as GraphqlError).message).toBe("Ce que GitHub a dit.");
  });

  it("says when GitHub answered without data", async () => {
    signIn();
    const call = failure(client.graphql("{ x }", {}));
    await settle();
    http.expectOne(GRAPHQL).flush({});

    expect(((await call) as GraphqlError).message).toBe(
      githubText().graphqlNoData,
    );
  });

  it("reports an HTTP failure as a GitHub error, not as a GraphQL one", async () => {
    signIn();
    const call = failure(client.graphql("{ x }", {}));
    await settle();
    http
      .expectOne(GRAPHQL)
      .error({ message: "Bad credentials" }, { status: 401 });

    const error = (await call) as GithubError;
    expect(error).not.toBeInstanceOf(GraphqlError);
    expect(error.status).toBe(401);
    expect(error.message).toBe(githubText().tokenRefused);
  });
});

describe("Toggling a pull request between draft and ready", () => {
  beforeEach(signIn);

  /** Answers the lookup of the pull request's id, then returns the mutation sent. */
  async function toggle(draft: boolean): Promise<string> {
    const call = client.toggleDraftPullRequest(REPO, 7, draft);
    await settle();
    const lookup = http.expectOne(GRAPHQL);
    expect(lookup.request.body).toMatchObject({
      variables: { owner: "org", repo: "projet", n: 7 },
    });
    lookup.flush({ data: { repository: { pullRequest: { id: "PR_7" } } } });
    await settle();
    const mutation = http.expectOne(GRAPHQL);
    const sent = mutation.request.body as {
      query: string;
      variables: { id: string };
    };
    expect(sent.variables).toEqual({ id: "PR_7" });
    mutation.flush({ data: {} });
    await call;
    return sent.query;
  }

  it("converts it to a draft", async () => {
    expect(await toggle(true)).toContain("convertPullRequestToDraft");
  });

  it("marks it ready for review", async () => {
    expect(await toggle(false)).toContain("markPullRequestReadyForReview");
  });

  it("names the pull request it did not find, and sends no mutation", async () => {
    const call = failure(client.toggleDraftPullRequest(REPO, 7, true));
    await settle();
    http
      .expectOne(GRAPHQL)
      .flush({ data: { repository: { pullRequest: null } } });

    expect(((await call) as GraphqlError).message).toBe(
      githubText().pullRequestNotFound(7),
    );
    await settle();
    http.verify();
  });
});

describe("The pull request of a branch", () => {
  const LOOKUP = `${REPO_API}/pulls?head=${encodeURIComponent("org:cadrage/2026-001")}&state=open&per_page=1`;

  it("is looked up by owner and branch, among open ones", async () => {
    const call = client.findPullRequestForBranch(REPO, "cadrage/2026-001");
    await settle();
    http.expectOne(LOOKUP).flush([{ number: 12, draft: true, title: "x" }]);

    expect(await call).toEqual({ number: 12, draft: true });
  });

  it("is null when the branch has none", async () => {
    const call = client.findPullRequestForBranch(REPO, "cadrage/2026-001");
    await settle();
    http.expectOne(LOOKUP).flush([]);

    expect(await call).toBeNull();
  });

  it("is null, not an error, when GitHub does not answer", async () => {
    const call = client.findPullRequestForBranch(REPO, "cadrage/2026-001");
    await settle();
    http.expectOne(LOOKUP).error(null, { status: 500 });

    expect(await call).toBeNull();
  });
});

describe("Writing", () => {
  it("opens a pull request, a draft when asked, and returns its number", async () => {
    signIn();
    const call = client.createPullRequest(
      REPO,
      "cadrage/2026-001",
      "main",
      "Cadrage 2026-001",
      "Le corps.",
      true,
    );
    await settle();
    const request = http.expectOne(`${REPO_API}/pulls`);
    request.flush({ number: 31 });

    expect(await call).toBe(31);
    expect(request.request.method).toBe("POST");
    expect(request.request.body).toEqual({
      title: "Cadrage 2026-001",
      body: "Le corps.",
      head: "cadrage/2026-001",
      base: "main",
      draft: true,
    });
  });

  it("deletes a file at the version it was given, on its branch", async () => {
    signIn();
    const call = client.deleteFile(
      REPO,
      "cadrage/2026-001",
      "cadrages/2026-001/decisions/D 1.md",
      "sha-lu",
      "Retire D 1.md",
    );
    await settle();
    const request = http.expectOne(
      `${REPO_API}/contents/cadrages/2026-001/decisions/D%201.md`,
    );
    request.flush({});
    await call;

    expect(request.request.method).toBe("DELETE");
    expect(request.request.body).toMatchObject({
      message: "Retire D 1.md",
      sha: "sha-lu",
      branch: "cadrage/2026-001",
    });
  });

  it("says a sign-in is missing, not that the repo is not found, on a 404 without a token", async () => {
    const call = failure(client.createPullRequest(REPO, "b", "main", "t", "c"));
    await settle();
    http.expectOne(`${REPO_API}/pulls`).error(null, { status: 404 });

    expect(((await call) as GithubError).message).toBe(
      githubText().writeSignInRequired,
    );
  });

  it("says a permission is missing on a 403 that is not the quota", async () => {
    signIn();
    const call = failure(client.createPullRequest(REPO, "b", "main", "t", "c"));
    await settle();
    http.expectOne(`${REPO_API}/pulls`).error(null, {
      status: 403,
      headers: { "x-ratelimit-remaining": "4000" },
    });

    expect(((await call) as GithubError).message).toBe(
      githubText().writePermissionMissing,
    );
  });
});

describe("An exhausted quota", () => {
  it.each([
    ["with a token", true, () => githubText().quotaWithToken],
    ["without a token", false, () => githubText().quotaWithoutToken],
  ])("is named as such %s", async (_label, withToken, message) => {
    if (withToken) signIn();
    const call = failure(client.branchSha(REPO, "main"));
    await settle();
    http
      .expectOne(`${REPO_API}/git/ref/heads/main`)
      .error(null, { status: 403, headers: { "x-ratelimit-remaining": "0" } });

    const error = (await call) as GithubError;
    expect(error.message).toBe(message());
    expect(error.status).toBe(403);
  });
});

describe("A 401", () => {
  it("speaks of a refused token when there is one", async () => {
    signIn();
    const call = failure(client.branchSha(REPO, "main"));
    await settle();
    http
      .expectOne(`${REPO_API}/git/ref/heads/main`)
      .error(null, { status: 401 });

    expect(((await call) as GithubError).message).toBe(
      githubText().tokenRefused,
    );
  });

  it("speaks of a missing sign-in when there is none", async () => {
    const call = failure(client.branchSha(REPO, "main"));
    await settle();
    http
      .expectOne(`${REPO_API}/git/ref/heads/main`)
      .error(null, { status: 401 });

    expect(((await call) as GithubError).message).toBe(
      githubText().signInRequired,
    );
  });
});

describe("Dates", () => {
  it("the last commit at a date: one call, the date passed as is", async () => {
    const date = new Date("2026-03-01T12:00:00Z");
    const call = client.commitAtDate(REPO, date);
    await settle();
    http
      .expectOne(
        `${REPO_API}/commits?until=${encodeURIComponent(date.toISOString())}&per_page=1`,
      )
      .flush([
        {
          sha: "abc",
          commit: {
            committer: { date: "2026-02-27T09:00:00Z" },
            message: "Cadrage 2026-001 : un titre\n\nLe corps du message.",
          },
        },
      ]);

    expect(await call).toEqual({
      sha: "abc",
      date: "2026-02-27T09:00:00Z",
      title: "Cadrage 2026-001 : un titre",
    });
  });

  it("no commit at a date before the repo's creation", async () => {
    const date = new Date("2020-01-01T00:00:00Z");
    const call = client.commitAtDate(REPO, date);
    await settle();
    http.expectOne((r) => r.url.includes("until=")).flush([]);

    expect(await call).toBeNull();
  });

  it("the first commit, from the last page the link header names", async () => {
    const call = client.firstCommitDate(REPO);
    await settle();
    http
      .expectOne(`${REPO_API}/commits?per_page=1`)
      .flush([{ commit: { committer: { date: "2026-10-01T00:00:00Z" } } }], {
        headers: {
          link: `<${REPO_API}/commits?per_page=1&page=2>; rel="next", <${REPO_API}/commits?per_page=1&page=58>; rel="last"`,
        },
      });
    await settle();
    http
      .expectOne(`${REPO_API}/commits?per_page=1&page=58`)
      .flush([{ commit: { committer: { date: "2025-01-15T00:00:00Z" } } }]);

    expect(await call).toBe("2025-01-15T00:00:00Z");
  });

  it("the first commit of a repo that fits in one page", async () => {
    const call = client.firstCommitDate(REPO);
    await settle();
    http
      .expectOne(`${REPO_API}/commits?per_page=1`)
      .flush([{ commit: { committer: { date: "2026-10-01T00:00:00Z" } } }]);

    expect(await call).toBe("2026-10-01T00:00:00Z");
  });

  it("no first date, rather than an error, when GitHub does not answer", async () => {
    const call = client.firstCommitDate(REPO);
    await settle();
    http.expectOne(`${REPO_API}/commits?per_page=1`).error(null, { status: 0 });

    expect(await call).toBeNull();
  });

  it("a file's creation: the oldest of its commits, the last one listed", async () => {
    const call = client.creationDate(REPO, "regles/RG-x.md");
    await settle();
    http
      .expectOne(
        `${REPO_API}/commits?path=${encodeURIComponent("regles/RG-x.md")}&per_page=100`,
      )
      .flush([
        { commit: { committer: { date: "2026-05-01T00:00:00Z" } } },
        { commit: { committer: { date: "2026-01-01T00:00:00Z" } } },
      ]);

    expect(await call).toBe("2026-01-01T00:00:00Z");
  });

  it("no creation date, rather than an error, when GitHub does not answer", async () => {
    const call = client.creationDate(REPO, "regles/RG-x.md");
    await settle();
    http.expectOne((r) => r.url.includes("path=")).error(null, { status: 500 });

    expect(await call).toBeNull();
  });
});

describe("The branches under a prefix", () => {
  it("are listed in one call, without their refs/heads/ prefix", async () => {
    const call = client.listBranches(REPO, "cadrage/");
    await settle();
    http
      .expectOne(`${REPO_API}/git/matching-refs/heads/cadrage/`)
      .flush([
        { ref: "refs/heads/cadrage/2026-001" },
        { ref: "refs/heads/cadrage/2026-002" },
      ]);

    expect(await call).toEqual(["cadrage/2026-001", "cadrage/2026-002"]);
  });

  it("are an empty list, rather than an error, when GitHub does not answer", async () => {
    const call = client.listBranches(REPO, "cadrage-");
    await settle();
    http
      .expectOne(`${REPO_API}/git/matching-refs/heads/cadrage-`)
      .error(null, { status: 500 });

    expect(await call).toEqual([]);
  });
});

describe("The repos a token reaches", () => {
  beforeEach(signIn);

  it("are the token owner's, organisations included", async () => {
    const call = client.listAllowedRepos();
    await settle();
    http
      .expectOne(
        (r) =>
          r.url.startsWith(`${API}/user/repos`) &&
          r.url.includes("affiliation=owner,collaborator,organization_member"),
      )
      .flush([{ owner: { login: "org" }, name: "projet" }]);

    expect(await call).toEqual([REPO]);
  });

  it("are a failure when the token is refused, with no other endpoint tried", async () => {
    const call = failure(client.listAllowedRepos());
    await settle();
    http
      .expectOne((r) => r.url.startsWith(`${API}/user/repos`))
      .error(null, { status: 403 });

    expect(((await call) as GithubError).status).toBe(403);
    await settle();
    http.verify();
  });
});

describe("Trying a token before saving it", () => {
  const fetchMock = vi.fn<typeof fetch>();

  beforeEach(() => {
    fetchMock.mockReset();
    vi.stubGlobal("fetch", fetchMock);
  });
  afterEach(() => vi.unstubAllGlobals());

  function respond(status: number, body: unknown): Response {
    return new Response(JSON.stringify(body), { status });
  }

  it("lists the repos it opens, sending it and only it", async () => {
    fetchMock.mockResolvedValueOnce(
      respond(200, [{ full_name: "org/projet" }, { full_name: "org/autre" }]),
    );

    expect(await client.tryToken("ghp_essai")).toEqual([
      "org/projet",
      "org/autre",
    ]);
    const [url, init] = fetchMock.mock.calls[0];
    expect(String(url)).toContain(
      "/user/repos?affiliation=owner,collaborator,organization_member",
    );
    expect(new Headers(init?.headers).get("Authorization")).toBe(
      "Bearer ghp_essai",
    );
    expect(inject(TokenService).present()).toBe(false);
  });

  it("says the token is refused on a 401", async () => {
    fetchMock.mockResolvedValueOnce(respond(401, {}));

    await expect(client.tryToken("ghp_essai")).rejects.toThrow(
      githubText().triedTokenRefused,
    );
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("gives GitHub's status on another refusal, with no other endpoint tried", async () => {
    fetchMock.mockResolvedValueOnce(respond(403, {}));

    await expect(client.tryToken("ghp_essai")).rejects.toThrow(
      githubText().triedTokenStatus(403),
    );
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });
});
