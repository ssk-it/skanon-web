import { inject, provide, resetInjection } from "../injection";
import { beforeEach, describe, expect, it } from "vitest";
import { GithubClient, GithubError, RepoRef } from "../github/github-client";
import { RepoConfig } from "./repo-config";
import { AuthoringService, EditableDecision } from "./authoring.service";
import { splitFrontmatter, isUnreadable, extractSection } from "./frontmatter";
import { repoText } from "./repo.messages";

/**
 * What the application writes to a scoping repo outside the editor: the links of a
 * scoping, its status, its decisions.
 *
 * A defect here damages the author's repo without the application noticing: a
 * section erased, a branch rewritten from the delivered version, a deletion forced
 * over a newer version. The repo is a fake held in memory, by branch and path, so
 * that each test reads back what was written.
 */

const ID = "2026-060";
const SCOPING = `cadrages/${ID}/cadrage.md`;
const BRANCH = "cadrage/2026-060";

const SCOPING_CONTENT = `---
id: ${ID}
titre: Un cadrage
domaines: []
liens:
  - { tag: carte_trello, url: https://trello.com/c/abc, nom: La carte }
  - { tag: maquette, url: https://exemple.test/maquette, nom: La maquette }
impacts:
  - { regle: RG-nouvelle, operation: cree }
---

## Objectif

L'objectif du cadrage.

## Parcours utilisateur

Le parcours.

## Énoncés

### RG-nouvelle

L'énoncé de la nouvelle règle.

## Mesures

Une section que l'application ne présente pas.
`;

interface Stored {
  content: string;
  sha: string;
}

/** What each branch carries, by path. */
let branches: Record<string, Record<string, Stored>>;
/** The open pull request of each branch, by number. */
let pullRequests: Record<string, number>;
let commits: Array<{
  branch: string;
  path: string;
  message: string;
  currentSha?: string;
}>;
let deletions: Array<{
  branch: string;
  path: string;
  sha: string;
  message: string;
}>;
let toggles: Array<{ number: number; draft: boolean }>;
let toggleFails: boolean;
let shaCounter: number;

function notFound(): GithubError {
  return new GithubError("Dépôt ou fichier introuvable.", 404);
}

beforeEach(() => {
  branches = { main: {} };
  pullRequests = {};
  commits = [];
  deletions = [];
  toggles = [];
  toggleFails = false;
  shaCounter = 0;
  resetInjection();
  provide(GithubClient, {
    loadRepo: async () => ({ defaultBranch: "main", description: null }),
    listOpenPullRequests: async () =>
      Object.entries(pullRequests).map(([branch, number]) => ({
        number,
        branch,
        draft: false,
        approval: null,
      })),
    listScopingBranches: async () =>
      Object.keys(branches).filter((b) => b.startsWith("cadrage")),
    loadEditableFile: async (_repo: RepoRef, path: string, branch: string) => {
      const file = branches[branch]?.[path];
      if (!file) throw notFound();
      return { ...file };
    },
    loadTree: async (repo: RepoRef) => {
      const files = branches[repo.ref ?? "main"];
      if (!files) throw notFound();
      return {
        sha: "racine",
        truncated: false,
        entries: Object.entries(files).map(([path, f]) => ({
          path,
          sha: f.sha,
          type: "blob" as const,
        })),
      };
    },
    commitFile: async (
      _repo: RepoRef,
      branch: string,
      path: string,
      content: string,
      message: string,
      currentSha?: string,
    ) => {
      const existing = branches[branch][path];
      // As the platform does: rewriting a file requires the SHA of its current version.
      if (existing?.sha !== currentSha)
        throw new GithubError("Le fichier a changé entre-temps.", 409);
      const sha = `sha-${++shaCounter}`;
      branches[branch][path] = { content, sha };
      commits.push({ branch, path, message, currentSha });
      return { commit: `commit-${shaCounter}`, file: sha };
    },
    deleteFile: async (
      _repo: RepoRef,
      branch: string,
      path: string,
      sha: string,
      message: string,
    ) => {
      if (branches[branch][path]?.sha !== sha)
        throw new GithubError("Le fichier a changé entre-temps.", 409);
      delete branches[branch][path];
      deletions.push({ branch, path, sha, message });
    },
    findPullRequestForBranch: async (_repo: RepoRef, branch: string) =>
      pullRequests[branch]
        ? { number: pullRequests[branch], draft: false }
        : null,
    toggleDraftPullRequest: async (
      _repo: RepoRef,
      number: number,
      draft: boolean,
    ) => {
      if (toggleFails) throw new GithubError("Bad gateway", 502);
      toggles.push({ number, draft });
    },
  });
  inject(RepoConfig).saveRepo({ owner: "org", repo: "depot" });
});

/** Puts the scoping on its branch, in progress. */
function scopingInProgress(content = SCOPING_CONTENT): void {
  branches[BRANCH] = { [SCOPING]: { content, sha: "sha-depart" } };
}

/** The scoping as its branch now carries it, frontmatter read. */
function written() {
  const parse = splitFrontmatter(branches[BRANCH][SCOPING].content);
  if (!parse || isUnreadable(parse)) throw new Error("cadrage illisible");
  return parse;
}

describe("Rewriting a scoping's links", () => {
  it("adds a link on the scoping's branch, over the version read there", async () => {
    scopingInProgress();

    await inject(AuthoringService).addLink(ID, {
      tag: "demande_fusion",
      url: "https://github.com/org/code/pull/12",
      name: "La demande",
    });

    expect(commits).toEqual([
      expect.objectContaining({
        branch: BRANCH,
        path: SCOPING,
        currentSha: "sha-depart",
      }),
    ]);
    expect(branches.main).toEqual({});
    expect(written().data["liens"]).toEqual([
      { tag: "carte_trello", url: "https://trello.com/c/abc", nom: "La carte" },
      {
        tag: "maquette",
        url: "https://exemple.test/maquette",
        nom: "La maquette",
      },
      {
        tag: "demande_fusion",
        url: "https://github.com/org/code/pull/12",
        nom: "La demande",
      },
    ]);
  });

  it("keeps everything else the scoping carries", async () => {
    scopingInProgress();

    await inject(AuthoringService).addLink(ID, {
      tag: "maquette",
      url: "https://exemple.test/autre",
      name: "",
    });

    const { data, body } = written();
    expect(data["titre"]).toBe("Un cadrage");
    expect(data["impacts"]).toEqual([
      { regle: "RG-nouvelle", operation: "cree" },
    ]);
    expect(extractSection(body, "Objectif")).toBe("L'objectif du cadrage.");
    expect(extractSection(body, "Parcours utilisateur")).toBe("Le parcours.");
    expect(body).toContain("### RG-nouvelle\n\nL'énoncé de la nouvelle règle.");
    // A section the application does not present would be lost by a rewrite
    // from what it shows.
    expect(extractSection(body, "Mesures")).toBe(
      "Une section que l'application ne présente pas.",
    );
  });

  it("corrects a link, address included, and leaves the others", async () => {
    scopingInProgress();

    await inject(AuthoringService).editLink(ID, "https://trello.com/c/abc", {
      tag: "carte_trello",
      url: "https://trello.com/c/def",
      name: "La bonne carte",
    });

    expect(written().data["liens"]).toEqual([
      {
        tag: "carte_trello",
        url: "https://trello.com/c/def",
        nom: "La bonne carte",
      },
      {
        tag: "maquette",
        url: "https://exemple.test/maquette",
        nom: "La maquette",
      },
    ]);
  });

  it("detaches only the link it is given", async () => {
    scopingInProgress();

    await inject(AuthoringService).deleteLink(ID, "https://trello.com/c/abc");

    expect(written().data["liens"]).toEqual([
      {
        tag: "maquette",
        url: "https://exemple.test/maquette",
        nom: "La maquette",
      },
    ]);
  });

  it("refuses a scoping without frontmatter, and writes nothing", async () => {
    scopingInProgress("## Objectif\n\nUn cadrage écrit sans en-tête.\n");

    await expect(
      inject(AuthoringService).addLink(ID, {
        tag: "maquette",
        url: "https://exemple.test/x",
        name: "",
      }),
    ).rejects.toThrow(repoText().scopingWithoutFrontmatter);
    expect(commits).toEqual([]);
  });

  it("does not touch a delivered scoping", async () => {
    branches.main = {
      [SCOPING]: { content: SCOPING_CONTENT, sha: "sha-main" },
    };

    await expect(
      inject(AuthoringService).deleteLink(ID, "https://trello.com/c/abc"),
    ).rejects.toThrow(repoText().scopingDelivered);
    expect(commits).toEqual([]);
  });
});

describe("Changing a scoping's status", () => {
  beforeEach(() => {
    scopingInProgress();
    pullRequests[BRANCH] = 7;
  });

  it("converts the pull request to a draft for « brouillon »", async () => {
    const outcome = await inject(AuthoringService).changeStatus(
      ID,
      "brouillon",
    );

    expect(toggles).toEqual([{ number: 7, draft: true }]);
    expect(outcome).toEqual({ status: "brouillon", toggleFailed: false });
  });

  it("marks the pull request ready for « en_relecture »", async () => {
    await inject(AuthoringService).changeStatus(ID, "en_relecture");

    expect(toggles).toEqual([{ number: 7, draft: false }]);
  });

  it("says when the platform refused, rather than claiming a change", async () => {
    toggleFails = true;

    const outcome = await inject(AuthoringService).changeStatus(
      ID,
      "en_relecture",
    );

    expect(outcome).toEqual({ status: "en_relecture", toggleFailed: true });
  });

  it("refuses « livree »: only the merge delivers", async () => {
    await expect(
      inject(AuthoringService).changeStatus(ID, "livree"),
    ).rejects.toThrow();
    expect(toggles).toEqual([]);
  });

  it("refuses a scoping no branch carries any more", async () => {
    delete branches[BRANCH];
    delete pullRequests[BRANCH];

    await expect(
      inject(AuthoringService).changeStatus(ID, "brouillon"),
    ).rejects.toThrow(repoText().statusFrozen);
  });

  it("refuses a branch without an open pull request", async () => {
    delete pullRequests[BRANCH];

    await expect(
      inject(AuthoringService).changeStatus(ID, "en_relecture"),
    ).rejects.toThrow(repoText().noOpenPullRequest);
    expect(toggles).toEqual([]);
  });
});

describe("A scoping's decisions", () => {
  const DECISION: EditableDecision = {
    title: "Où ranger les pièces",
    status: "retenue",
    description: "Les pièces jointes doivent vivre quelque part.",
    options: [
      { id: "dans-le-depot", body: "Dans le dépôt, à côté du cadrage." },
      { id: "ailleurs", body: "Sur un stockage à part." },
    ],
    chosenOption: "dans-le-depot",
    decision: "Le dépôt garde tout au même endroit.",
  };

  beforeEach(() => scopingInProgress());

  it("are written on the scoping's branch, and read back as they were", async () => {
    const authoring = inject(AuthoringService);

    const sha = await authoring.saveDecision(ID, "D1", BRANCH, DECISION);
    const read = await authoring.loadDecisions(ID, BRANCH);

    const path = authoring.decisionPath(ID, "D1");
    expect(commits).toEqual([
      expect.objectContaining({ branch: BRANCH, path, currentSha: undefined }),
    ]);
    expect(read).toEqual([{ file: path, sha, decision: DECISION }]);
  });

  it("are rewritten over the version read, and refused over a stale one", async () => {
    const authoring = inject(AuthoringService);
    const first = await authoring.saveDecision(ID, "D1", BRANCH, DECISION);

    await authoring.saveDecision(
      ID,
      "D1",
      BRANCH,
      { ...DECISION, decision: "Une autre raison." },
      first,
    );

    await expect(
      authoring.saveDecision(ID, "D1", BRANCH, DECISION, first),
    ).rejects.toThrow(GithubError);
    const [read] = await authoring.loadDecisions(ID, BRANCH);
    expect(read.decision.decision).toBe("Une autre raison.");
  });

  it("are read only from the scoping's folder, in order, skipping the unreadable", async () => {
    const authoring = inject(AuthoringService);
    await authoring.saveDecision(ID, "D2", BRANCH, DECISION);
    await authoring.saveDecision(ID, "D1", BRANCH, DECISION);
    const folder = authoring.decisionPath(ID, "x").replace(/x\.md$/, "");
    branches[BRANCH][`${folder}notes.txt`] = {
      content: branches[BRANCH][authoring.decisionPath(ID, "D1")].content,
      sha: "s1",
    };
    branches[BRANCH][`${folder}casse.md`] = {
      content: "---\ntitre: [non fermé\n---\n",
      sha: "s2",
    };
    branches[BRANCH][authoring.decisionPath("2026-061", "D1")] = {
      content: branches[BRANCH][authoring.decisionPath(ID, "D1")].content,
      sha: "s3",
    };

    const read = await authoring.loadDecisions(ID, BRANCH);

    expect(read.map((d) => d.file)).toEqual([
      authoring.decisionPath(ID, "D1"),
      authoring.decisionPath(ID, "D2"),
    ]);
  });

  it("are deleted at the version the branch carries now", async () => {
    const authoring = inject(AuthoringService);
    await authoring.saveDecision(ID, "D1", BRANCH, DECISION);
    const path = authoring.decisionPath(ID, "D1");
    // Rewritten since the screen read it, by another author.
    const now = await authoring.saveDecision(
      ID,
      "D1",
      BRANCH,
      DECISION,
      branches[BRANCH][path].sha,
    );

    await authoring.deleteDecision(BRANCH, path);

    expect(deletions).toEqual([
      { branch: BRANCH, path, sha: now, message: "Retire D1.md" },
    ]);
    expect(branches[BRANCH][path]).toBeUndefined();
  });
});
