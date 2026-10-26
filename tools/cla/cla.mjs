/**
 * What the CLA check decides, without talking to GitHub (ADR-contributions-relicenciables). `check.mjs` does the talking.
 */

/** What a contributor posts, alone, as a pull-request comment to sign. `CLA.md` and `CONTRIBUTING.md` quote it word for word, which a test enforces. */
export const SIGNING_PHRASE = "I have read the CLA and I hereby sign it.";

/** The rights holder, who has nothing to grant to themself, and Dependabot, whose version bumps are not a work. */
export const EXEMPT = ["sskorupski", "dependabot[bot]"];

/** Starts every comment the check posts: how it finds its own again. */
export const MARKER = "<!-- cla-check -->";

/** The version `CLA.md` states. A signature records it, and a new version asks everyone again. */
export function claVersion(markdown) {
  const match = /^Version (\d+\.\d+)\b/m.exec(markdown);
  if (!match)
    throw new Error("CLA.md states no version (a line `Version x.y, …`)");
  return match[1];
}

/** The phrase alone: a comment that quotes it or asks about it is not a signature. */
export function isSignature(body) {
  const normalise = (text) => text.trim().replace(/\s+/g, " ").toLowerCase();
  return (
    typeof body === "string" && normalise(body) === normalise(SIGNING_PHRASE)
  );
}

/**
 * The author of each commit, once — not only the pull request's, who may carry a colleague's commit. A commit whose email is linked to no account is kept as unlinked: nobody can sign for it, so it blocks. Co-author trailers are not read.
 */
export function authorsOf(commits) {
  const authors = new Map();
  for (const { sha, author, commit } of commits) {
    if (author)
      authors.set(`id:${author.id}`, { login: author.login, id: author.id });
    else
      authors.set(`sha:${sha}`, {
        unlinked: commit.author.name,
        sha: sha.slice(0, 7),
      });
  }
  return [...authors.values()];
}

/** The authors still to sign the current version, by account id: a login can be renamed. */
export function unsigned(authors, signatures, version) {
  return authors.filter(
    (author) =>
      author.unlinked !== undefined ||
      (!EXEMPT.includes(author.login) &&
        !signatures.some((s) => s.id === author.id && s.version === version)),
  );
}

/** The signatures with this one added; an earlier version's is kept, as the record of what was granted then. */
export function withSignature(
  signatures,
  signer,
  version,
  pullRequest,
  signedAt,
) {
  if (signatures.some((s) => s.id === signer.id && s.version === version)) {
    return { signatures, added: false };
  }
  const signature = {
    login: signer.login,
    id: signer.id,
    version,
    pullRequest,
    signedAt,
  };
  return { signatures: [...signatures, signature], added: true };
}

/** The commit status the branch protection requires. */
export function statusOf(missing) {
  return missing.length === 0
    ? { state: "success", description: "Every author has signed the CLA" }
    : {
        state: "failure",
        description: `${missing.length} author(s) still to sign the CLA`,
      };
}

/** The comment that tells who is missing and how to sign, or that everyone has. `docs` is where the repo's files are read on GitHub: a relative link in a comment would resolve against the pull request's page. */
export function reportComment(missing, version, docs) {
  if (missing.length === 0) {
    return `${MARKER}\nAll commit authors have signed the [CLA](${docs}/CLA.md), version ${version}. Thank you.`;
  }
  const who = missing.map((author) =>
    author.unlinked === undefined
      ? `- @${author.login}`
      : `- ${author.unlinked}, commit ${author.sha}: its email is linked to no GitHub account. Link it, or amend the commit with an email that is, then sign.`,
  );
  return [
    MARKER,
    `Thank you for contributing. Before this pull request can be merged, each commit author must sign the [Contributor Licence Agreement](${docs}/CLA.md), version ${version}:`,
    "",
    ...who,
    "",
    "To sign, read the CLA, then post this comment on this pull request, alone:",
    "",
    "```",
    SIGNING_PHRASE,
    "```",
    "",
    `You sign once; a new version of the CLA asks again. Why a CLA: [CONTRIBUTING.md](${docs}/CONTRIBUTING.md).`,
  ].join("\n");
}
