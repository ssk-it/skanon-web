/**
 * The CLA check, called by `.github/workflows/cla.yml` through `actions/github-script` with its authenticated client (ADR-contributions-relicenciables, 2026-059/07).
 *
 * The workflow runs this file from the default branch, never from the pull request: it holds a token that can write, and a pull request must not be able to change what checks it.
 */
import {
  authorsOf,
  claVersion,
  isSignature,
  MARKER,
  reportComment,
  statusOf,
  unsigned,
  withSignature,
} from "./cla.mjs";

/** Where signatures are kept: a branch of this repo that only the workflow writes, with no history shared with `main`. */
export const SIGNATURES_BRANCH = "cla-signatures";
const SIGNATURES_FILE = "signatures.json";

/** The status context `main`'s protection requires. A status, not the job's own check: a signature arrives as a comment, whose run GitHub does not attach to the pull request's head. */
export const STATUS_CONTEXT = "CLA";

/** Two signatures written at the same time: the second is refused (409) and retried on the new file. */
const WRITE_ATTEMPTS = 3;

/**
 * On a pull request, or on one of its comments: records a signature if the comment is one, then sets the CLA status of the head commit and keeps the check's comment up to date.
 */
export async function checkCla({ github, context, claText, now = new Date() }) {
  const version = claVersion(claText);
  const { repo } = context;
  const number =
    context.payload.pull_request?.number ?? context.payload.issue.number;

  if (context.eventName === "issue_comment") {
    const { comment } = context.payload;
    if (!isSignature(comment.body)) return;
    await recordSignature(
      github,
      repo,
      comment.user,
      version,
      number,
      now.toISOString(),
    );
  }

  const head =
    context.payload.pull_request?.head.sha ??
    (await github.rest.pulls.get({ ...repo, pull_number: number })).data.head
      .sha;
  const commits = await github.paginate(github.rest.pulls.listCommits, {
    ...repo,
    pull_number: number,
    per_page: 100,
  });
  const { signatures } = await loadSignatures(github, repo);
  const missing = unsigned(authorsOf(commits), signatures, version);

  await github.rest.repos.createCommitStatus({
    ...repo,
    sha: head,
    context: STATUS_CONTEXT,
    ...statusOf(missing),
  });
  const docs = `https://github.com/${repo.owner}/${repo.repo}/blob/${context.payload.repository?.default_branch ?? "main"}`;
  await upsertComment(
    github,
    repo,
    number,
    missing,
    reportComment(missing, version, docs),
  );
}

async function recordSignature(
  github,
  repo,
  signer,
  version,
  pullRequest,
  signedAt,
) {
  for (let attempt = 1; ; attempt++) {
    const { signatures, sha } = await loadSignatures(github, repo);
    const next = withSignature(
      signatures,
      signer,
      version,
      pullRequest,
      signedAt,
    );
    if (!next.added) return;
    try {
      await saveSignatures(
        github,
        repo,
        next.signatures,
        sha,
        `Sign the CLA ${version}: ${signer.login}`,
      );
      return;
    } catch (error) {
      if (error.status !== 409 || attempt >= WRITE_ATTEMPTS) throw error;
    }
  }
}

/** The signatures, and the file's sha to update it; none while the branch does not exist yet. */
async function loadSignatures(github, repo) {
  try {
    const { data } = await github.rest.repos.getContent({
      ...repo,
      path: SIGNATURES_FILE,
      ref: SIGNATURES_BRANCH,
    });
    const file = JSON.parse(
      Buffer.from(data.content, "base64").toString("utf8"),
    );
    return { signatures: file.signatures, sha: data.sha };
  } catch (error) {
    if (error.status === 404) return { signatures: [], sha: null };
    throw error;
  }
}

async function saveSignatures(github, repo, signatures, sha, message) {
  const content = `${JSON.stringify({ signatures }, null, 2)}\n`;
  if (sha) {
    await github.rest.repos.createOrUpdateFileContents({
      ...repo,
      branch: SIGNATURES_BRANCH,
      path: SIGNATURES_FILE,
      message,
      sha,
      content: Buffer.from(content).toString("base64"),
    });
    return;
  }
  // The first signature creates the branch from a root commit: it shares nothing with `main`, and no pull request can merge it there.
  const tree = await github.rest.git.createTree({
    ...repo,
    tree: [{ path: SIGNATURES_FILE, mode: "100644", type: "blob", content }],
  });
  const commit = await github.rest.git.createCommit({
    ...repo,
    message,
    tree: tree.data.sha,
    parents: [],
  });
  await github.rest.git.createRef({
    ...repo,
    ref: `refs/heads/${SIGNATURES_BRANCH}`,
    sha: commit.data.sha,
  });
}

/** One comment per pull request, updated at each run; none at all when nobody ever had to sign. */
async function upsertComment(github, repo, number, missing, body) {
  const comments = await github.paginate(github.rest.issues.listComments, {
    ...repo,
    issue_number: number,
    per_page: 100,
  });
  const own = comments.find(
    (c) => c.user?.type === "Bot" && c.body?.startsWith(MARKER),
  );
  if (own) {
    if (own.body !== body)
      await github.rest.issues.updateComment({
        ...repo,
        comment_id: own.id,
        body,
      });
  } else if (missing.length > 0) {
    await github.rest.issues.createComment({
      ...repo,
      issue_number: number,
      body,
    });
  }
}
