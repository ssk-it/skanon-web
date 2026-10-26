import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import {
  SIGNING_PHRASE,
  authorsOf,
  claVersion,
  isSignature,
  reportComment,
  statusOf,
  unsigned,
  withSignature,
} from "./cla.mjs";

const commit = (sha, author, name = "Ada Lovelace") => ({
  sha,
  author,
  commit: { author: { name, email: "ada@example.org" } },
});
const ada = { login: "ada", id: 1 };
const grace = { login: "grace", id: 2 };
const signature = (user, version) => ({
  login: user.login,
  id: user.id,
  version,
  pullRequest: 7,
  signedAt: "2026-10-26T12:00:00.000Z",
});

describe("claVersion", () => {
  it("reads the version the CLA states", () => {
    expect(claVersion("# CLA\n\nVersion 1.0, 26 October 2026\n")).toBe("1.0");
  });

  it("refuses a CLA without a version: a signature must say what it signed", () => {
    expect(() => claVersion("# CLA\n")).toThrow(/version/i);
  });

  it("finds a version in the repo's own CLA", () => {
    const text = readFileSync(new URL("../../CLA.md", import.meta.url), "utf8");
    expect(claVersion(text)).toMatch(/^\d+\.\d+$/);
  });

  it("states the signing phrase in the repo's own guide and CLA", () => {
    for (const file of ["../../CLA.md", "../../CONTRIBUTING.md"]) {
      const text = readFileSync(new URL(file, import.meta.url), "utf8");
      expect(text, file).toContain(SIGNING_PHRASE);
    }
  });
});

describe("isSignature", () => {
  it("accepts the phrase, whatever the surrounding spaces and case", () => {
    expect(isSignature(`  ${SIGNING_PHRASE.toUpperCase()}\n`)).toBe(true);
  });

  it("refuses a comment that only quotes or discusses it", () => {
    expect(isSignature(`> ${SIGNING_PHRASE}`)).toBe(false);
    expect(isSignature(`Should I write "${SIGNING_PHRASE}"?`)).toBe(false);
    expect(isSignature("")).toBe(false);
    expect(isSignature(undefined)).toBe(false);
  });
});

describe("authorsOf", () => {
  it("lists each commit author once, by GitHub account", () => {
    const authors = authorsOf([
      commit("a1", ada),
      commit("b2", grace),
      commit("c3", ada),
    ]);
    expect(authors).toEqual([ada, grace]);
  });

  it("keeps a commit whose email is linked to no account, so that it blocks", () => {
    expect(authorsOf([commit("abcdef1234", null, "Anonymous")])).toEqual([
      { unlinked: "Anonymous", sha: "abcdef1" },
    ]);
  });
});

describe("unsigned", () => {
  it("is empty when every author signed the current version", () => {
    expect(unsigned([ada], [signature(ada, "1.0")], "1.0")).toEqual([]);
  });

  it("asks again for a signature of an earlier version", () => {
    expect(unsigned([ada], [signature(ada, "0.9")], "1.0")).toEqual([ada]);
  });

  it("matches the account id, which survives a renamed login", () => {
    const renamed = { login: "ada-l", id: 1 };
    expect(unsigned([renamed], [signature(ada, "1.0")], "1.0")).toEqual([]);
  });

  it("exempts the rights holder and Dependabot", () => {
    const owner = { login: "sskorupski", id: 10 };
    const dependabot = { login: "dependabot[bot]", id: 11 };
    expect(unsigned([owner, dependabot], [], "1.0")).toEqual([]);
  });

  it("never exempts an author without an account", () => {
    const unlinked = { unlinked: "Anonymous", sha: "abcdef1" };
    expect(unsigned([unlinked], [], "1.0")).toEqual([unlinked]);
  });
});

describe("withSignature", () => {
  const at = "2026-10-26T12:00:00.000Z";

  it("adds the signer, the version, the pull request and the date", () => {
    expect(withSignature([], ada, "1.0", 7, at)).toEqual({
      signatures: [signature(ada, "1.0")],
      added: true,
    });
  });

  it("does not record the same version twice", () => {
    const signatures = [signature(ada, "1.0")];
    expect(withSignature(signatures, ada, "1.0", 8, at)).toEqual({
      signatures,
      added: false,
    });
  });

  it("keeps an earlier version's signature next to the new one", () => {
    const { signatures } = withSignature(
      [signature(ada, "0.9")],
      ada,
      "1.0",
      7,
      at,
    );
    expect(signatures.map((s) => s.version)).toEqual(["0.9", "1.0"]);
  });
});

describe("statusOf", () => {
  it("succeeds when nobody is missing", () => {
    expect(statusOf([]).state).toBe("success");
  });

  it("fails and counts who is missing", () => {
    const status = statusOf([ada, grace]);
    expect(status.state).toBe("failure");
    expect(status.description).toMatch(/2/);
  });
});

describe("reportComment", () => {
  const docs = "https://github.com/ssk-it/skanon-web/blob/main";

  it("names each missing author and gives the phrase to post", () => {
    const body = reportComment(
      [ada, { unlinked: "Anonymous", sha: "abcdef1" }],
      "1.0",
      docs,
    );
    expect(body).toContain("@ada");
    expect(body).toContain("abcdef1");
    expect(body).toContain(SIGNING_PHRASE);
    expect(body).toContain(`${docs}/CLA.md`);
  });

  it("says when everyone has signed", () => {
    expect(reportComment([], "1.0", docs)).toMatch(/all .*signed/i);
  });

  it("starts with the same marker, so that the check finds its own comment", () => {
    const [first] = reportComment([ada], "1.0", docs).split("\n");
    expect(reportComment([], "1.0", docs).split("\n")[0]).toBe(first);
  });
});
