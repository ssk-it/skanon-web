import { beforeEach, describe, expect, it } from "vitest";
import { SIGNING_PHRASE } from "./cla.mjs";
import { checkCla } from "./check.mjs";

const CLA = "# Contributor Licence Agreement\n\nVersion 1.0, 26 October 2026\n";
const NOW = new Date("2026-10-26T12:00:00.000Z");
const ada = { login: "ada", id: 1 };
const owner = { login: "sskorupski", id: 10 };
const repo = { owner: "ssk-it", repo: "skanon-web" };

const httpError = (status) =>
  Object.assign(new Error(`HTTP ${status}`), { status });
const encode = (value) => Buffer.from(JSON.stringify(value)).toString("base64");

/** GitHub as the check sees it: a pull request, its commits, the signatures branch, comments and statuses. */
function fakeGithub({ authors = [ada], signatures = null } = {}) {
  const state = {
    file: signatures && { sha: "s0", signatures },
    comments: [],
    statuses: [],
    commits: [],
    refused: false,
    conflicts: 0,
  };
  const rest = {
    pulls: {
      get: async () => ({ data: { number: 7, head: { sha: "head7" } } }),
      listCommits: async () => ({
        data: authors.map((author, i) => ({
          sha: `c${i}`,
          author,
          commit: { author: { name: "Someone", email: "x@example.org" } },
        })),
      }),
    },
    repos: {
      getContent: async ({ ref, path }) => {
        expect([ref, path]).toEqual(["cla-signatures", "signatures.json"]);
        if (!state.file) throw httpError(404);
        return { data: { sha: state.file.sha, content: encode(state.file) } };
      },
      createOrUpdateFileContents: async ({ sha, content, branch }) => {
        expect(branch).toBe("cla-signatures");
        if (state.refused) throw httpError(403);
        if (state.conflicts > 0) {
          state.conflicts--;
          throw httpError(409);
        }
        expect(sha).toBe(state.file.sha);
        const next = JSON.parse(Buffer.from(content, "base64").toString());
        state.file = { ...next, sha: `${sha}+` };
        return { data: {} };
      },
      createCommitStatus: async (status) => {
        state.statuses.push(status);
        return { data: {} };
      },
    },
    issues: {
      listComments: async () => ({ data: state.comments }),
      createComment: async ({ body }) => {
        state.comments.push({
          id: state.comments.length + 1,
          body,
          user: { type: "Bot" },
        });
        return { data: {} };
      },
      updateComment: async ({ comment_id, body }) => {
        state.comments.find((c) => c.id === comment_id).body = body;
        return { data: {} };
      },
    },
    git: {
      createTree: async ({ tree }) => {
        state.tree = tree;
        return { data: { sha: "tree1" } };
      },
      createCommit: async ({ parents }) => {
        state.commits.push({ parents });
        return { data: { sha: "root1" } };
      },
      createRef: async ({ ref, sha }) => {
        expect([ref, sha]).toEqual(["refs/heads/cla-signatures", "root1"]);
        const content = state.tree[0].content;
        state.file = { ...JSON.parse(content), sha: "s1" };
        return { data: {} };
      },
    },
  };
  const github = {
    rest,
    paginate: async (method, params) => (await method(params)).data,
  };
  return { github, state };
}

const onPullRequest = {
  eventName: "pull_request_target",
  repo,
  payload: { pull_request: { number: 7, head: { sha: "head7" } } },
};
const onComment = (body, user = ada) => ({
  eventName: "issue_comment",
  repo,
  payload: { issue: { number: 7, pull_request: {} }, comment: { body, user } },
});

const run = (github, context) =>
  checkCla({ github, context, claText: CLA, now: NOW });

describe("checkCla on a pull request", () => {
  it("fails the CLA status, and says how to sign, when an author has not signed", async () => {
    const { github, state } = fakeGithub();
    await run(github, onPullRequest);
    expect(state.statuses).toEqual([
      expect.objectContaining({
        sha: "head7",
        context: "CLA",
        state: "failure",
      }),
    ]);
    expect(state.comments).toHaveLength(1);
    expect(state.comments[0].body).toContain(SIGNING_PHRASE);
  });

  it("passes when every author signed the current version", async () => {
    const signed = [{ ...ada, version: "1.0", pullRequest: 3, signedAt: "x" }];
    const { github, state } = fakeGithub({ signatures: signed });
    await run(github, onPullRequest);
    expect(state.statuses[0].state).toBe("success");
    expect(state.comments).toEqual([]);
  });

  it("passes the rights holder's own pull request without asking anything", async () => {
    const { github, state } = fakeGithub({ authors: [owner] });
    await run(github, onPullRequest);
    expect(state.statuses[0].state).toBe("success");
    expect(state.comments).toEqual([]);
  });

  it("updates its own comment rather than adding one at each push", async () => {
    const { github, state } = fakeGithub();
    await run(github, onPullRequest);
    await run(github, onPullRequest);
    expect(state.comments).toHaveLength(1);
  });
});

describe("checkCla on a comment", () => {
  it("records the signature on a new signatures branch, then passes", async () => {
    const { github, state } = fakeGithub();
    await run(github, onComment(SIGNING_PHRASE));
    expect(state.commits).toEqual([{ parents: [] }]);
    expect(state.file.signatures).toEqual([
      {
        login: "ada",
        id: 1,
        version: "1.0",
        pullRequest: 7,
        signedAt: NOW.toISOString(),
      },
    ]);
    expect(state.statuses.at(-1)).toMatchObject({
      sha: "head7",
      state: "success",
    });
  });

  it("adds to the existing signatures, retrying when another signature landed first", async () => {
    const grace = {
      login: "grace",
      id: 2,
      version: "1.0",
      pullRequest: 2,
      signedAt: "x",
    };
    const { github, state } = fakeGithub({ signatures: [grace] });
    state.conflicts = 1;
    await run(github, onComment(SIGNING_PHRASE));
    expect(state.file.signatures.map((s) => s.login)).toEqual(["grace", "ada"]);
  });

  it("turns its earlier comment into a confirmation once everyone has signed", async () => {
    const { github, state } = fakeGithub();
    await run(github, onPullRequest);
    await run(github, onComment(SIGNING_PHRASE));
    expect(state.comments).toHaveLength(1);
    expect(state.comments[0].body).toMatch(/all .*signed/i);
  });

  it("ignores any other comment, and leaves the status alone", async () => {
    const { github, state } = fakeGithub();
    await run(github, onComment("Looks good to me"));
    expect(state.statuses).toEqual([]);
    expect(state.file).toBeNull();
  });

  it("fails loudly when the signature cannot be written", async () => {
    const { github, state } = fakeGithub({ signatures: [] });
    state.refused = true;
    await expect(run(github, onComment(SIGNING_PHRASE))).rejects.toThrow(/403/);
  });
});

beforeEach(() => {
  expect.hasAssertions();
});
