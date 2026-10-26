import { flushPromises, mount, type VueWrapper } from "@vue/test-utils";
import { beforeEach, describe, expect, it } from "vitest";
import { createMemoryHistory } from "vue-router";
import { provideHttpTesting } from "../../core/http/http-testing";
import { GithubError } from "../../core/github/github-client";
import { inject, provide } from "../../core/injection";
import { DEFAULT_LINK_TAGS, type Specification } from "../../core/model/model";
import {
  listToggles,
  AuthoringService,
  type EditableDecision,
  type EditableScoping,
  type ScopingSource,
} from "../../core/repo/authoring.service";
import { SpecificationStore } from "../../core/repo/specification.store";
import { RepoConfig } from "../../core/repo/repo-config";
import { createAppRouter } from "../../router";
import EditScopingPage from "./EditScopingPage.vue";
import { editScopingMessages } from "./edit-scoping.messages";

/**
 * The scoping editor: it loads a scoping from its branch, flags what would block
 * its delivery, and writes back the scoping and its decisions.
 *
 * What it must not do is lose what it does not show — links, free sections — nor
 * rewrite decisions nobody touched, nor undo a choice when an option is renamed.
 * The service behind it is a fake that records what it is asked to write.
 */

const m = editScopingMessages.fr;
const ID = "2026-050";
const BRANCH = "cadrage-2026-050";

const CONTENT = `---
id: ${ID}
titre: Un cadrage à reprendre
domaines: [d]
liens:
  - { tag: carte_trello, url: https://trello.com/c/abc, nom: La carte }
impacts:
  - { regle: RG-nouvelle, operation: cree }
  - { adr: ADR-001, operation: touche }
---

## Objectif

L'objectif.

## Parcours utilisateur

Le parcours.

## Énoncés

### RG-nouvelle

L'énoncé.

## Mesures

Une section libre.
`;

const DECISION: EditableDecision = {
  title: "Où ranger les pièces",
  status: "ouverte",
  description: "Une question.",
  options: [
    { id: "depot", body: "Dans le dépôt." },
    { id: "ailleurs", body: "Ailleurs." },
  ],
  chosenOption: "depot",
  decision: "",
};

function specification(): Specification {
  return {
    project: { name: "Essai", description: "", codeRepos: [], prefix: null },
    settings: {
      access: "jeton_personnel",
      identity: null,
      tokenProtection: "proposee",
      linkTags: DEFAULT_LINK_TAGS,
    },
    domains: new Map([["d", { id: "d", name: "D", description: "" }]]),
    features: new Map(),
    rules: new Map(),
    // The architecture decision the scoping touches: an unknown one would block it.
    decisions: new Map([
      [
        "ADR-001",
        {
          id: "ADR-001",
          status: "actif",
          statement: "",
          createdBy: null,
          modifiedBy: [],
        },
      ],
    ]),
    architecture: new Map(),
    scopings: new Map(),
    anomalies: [],
  };
}

/** What the fake service was asked to write. */
let savedScopings: Array<{ source: ScopingSource; scoping: EditableScoping }>;
let savedDecisions: Array<{
  id: string;
  decision: EditableDecision;
  sha?: string;
}>;
let deleted: string[];
let statusChanges: string[];
let content: string;
let loadFails: Error | null;
let decisionsFail: boolean;
let saveFails: Error | null;
let toggleFails: boolean;
let decisionsOnBranch: EditableDecision[];

beforeEach(() => {
  savedScopings = [];
  savedDecisions = [];
  deleted = [];
  statusChanges = [];
  content = CONTENT;
  loadFails = null;
  decisionsFail = false;
  saveFails = null;
  toggleFails = false;
  decisionsOnBranch = [DECISION];
});

const path = (d: string) => `cadrages/${ID}/decisions/${d}.md`;

async function mountEditor(): Promise<VueWrapper> {
  provideHttpTesting();
  provide(AuthoringService, {
    loadForEditing: async () => {
      if (loadFails) throw loadFails;
      return {
        source: {
          branch: BRANCH,
          path: `cadrages/${ID}/cadrage.md`,
          sha: "sha-1",
        },
        content,
        context: null,
        mainBranch: "main",
      };
    },
    loadDecisions: async () => {
      if (decisionsFail) throw new GithubError("indisponible", 502);
      return decisionsOnBranch.map((decision, n) => ({
        file: path(`0${n + 1}-question`),
        sha: `sha-d${n + 1}`,
        decision,
      }));
    },
    possibleTransitions: listToggles,
    saveScoping: async (
      _id: string,
      source: ScopingSource,
      scoping: EditableScoping,
    ) => {
      if (saveFails) throw saveFails;
      savedScopings.push({ source, scoping });
      return { ...source, sha: "sha-2" };
    },
    saveDecision: async (
      _scoping: string,
      id: string,
      _branch: string,
      decision: EditableDecision,
      sha?: string,
    ) => {
      savedDecisions.push({ id, decision, sha });
      return `sha-${id}-nouveau`;
    },
    decisionPath: (_scoping: string, d: string) => path(d),
    deleteDecision: async (_branch: string, p: string) => {
      deleted.push(p);
    },
    changeStatus: async (_id: string, to: string) => {
      statusChanges.push(to);
      return { status: to, toggleFailed: toggleFails };
    },
  });
  inject(RepoConfig).saveRepo({ owner: "org", repo: "depot" });
  const store = inject(SpecificationStore);
  store.specification.set(specification());
  store.state.set("pret");

  const router = createAppRouter(createMemoryHistory());
  await router.push(`/org/depot/cadrages/${ID}/editer`);
  await router.isReady();
  const wrapper = mount(EditScopingPage, { global: { plugins: [router] } });
  await settle();
  return wrapper;
}

async function settle(): Promise<void> {
  for (let i = 0; i < 10; i++) await Promise.resolve();
  await flushPromises();
}

function field(w: VueWrapper, name: string) {
  return w.find(`[name="${name}"]`);
}

function value(w: VueWrapper, name: string): string {
  return (field(w, name).element as HTMLInputElement).value;
}

function button(w: VueWrapper, label: string) {
  const found = w
    .findAll("button")
    .find(
      (b) =>
        b.attributes("aria-label") === label || b.text().trim().endsWith(label),
    );
  if (!found) throw new Error(`bouton introuvable : ${label}`);
  return found;
}

function problems(w: VueWrapper): string[] {
  return w.findAll(".problemes li").map((li) => li.text());
}

async function save(w: VueWrapper): Promise<void> {
  await w.find("form").trigger("submit");
  await settle();
}

describe("Loading a scoping into the editor", () => {
  it("fills the form from the file its branch carries", async () => {
    const w = await mountEditor();

    expect(w.text()).toContain(BRANCH);
    expect(value(w, "titre")).toBe("Un cadrage à reprendre");
    expect(value(w, "domaines")).toBe("d");
    expect(value(w, "objectif")).toBe("L'objectif.");
    expect(value(w, "parcours")).toBe("Le parcours.");
    expect(value(w, "cible0")).toBe("RG-nouvelle");
    expect(value(w, "enonce0")).toBe("L'énoncé.");
    expect(value(w, "cible1")).toBe("ADR-001");
    // « touche » derives no write: no statement to enter.
    expect(field(w, "enonce1").exists()).toBe(false);
    expect(value(w, "dtitre0")).toBe("Où ranger les pièces");
    expect(problems(w)).toEqual([]);
  });

  it("says why a file without frontmatter cannot be edited", async () => {
    content = "## Objectif\n\nSans en-tête.\n";
    const w = await mountEditor();

    expect(w.find(".erreur").text()).toContain(m.noFrontmatter);
    expect(w.find("form").exists()).toBe(false);
  });

  it("shows the cause of a failed load", async () => {
    loadFails = new GithubError("Aucune branche ne porte ce cadrage.", 404);
    const w = await mountEditor();

    expect(w.find(".erreur").text()).toContain(
      "Aucune branche ne porte ce cadrage.",
    );
  });

  it("lets the scoping be edited when its decisions cannot be read", async () => {
    decisionsFail = true;
    const w = await mountEditor();

    expect(value(w, "titre")).toBe("Un cadrage à reprendre");
    expect(w.text()).toContain(m.noDecision);
  });
});

describe("What would block delivery", () => {
  it("is listed, and keeps the scoping from being saved", async () => {
    const w = await mountEditor();

    await field(w, "titre").setValue("  ");
    await field(w, "parcours").setValue("");

    expect(problems(w)).toEqual([m.missingTitle, m.missingJourney]);
    expect(button(w, m.save).attributes("disabled")).toBeDefined();
    await save(w);
    expect(savedScopings).toEqual([]);
  });

  it("counts the impacts that designate no rule", async () => {
    const w = await mountEditor();

    await button(w, m.add).trigger("click");

    expect(problems(w)).toEqual([m.withoutRule(1)]);
  });

  it("drops an impact removed from the form", async () => {
    const w = await mountEditor();
    await button(w, m.add).trigger("click");

    await w.findAll(`[aria-label="${m.removeImpact}"]`)[2].trigger("click");

    expect(problems(w)).toEqual([]);
  });
});

describe("Saving", () => {
  it("writes the scoping with what the form does not show", async () => {
    const w = await mountEditor();
    await field(w, "titre").setValue("Un titre corrigé");

    await save(w);

    expect(savedScopings).toHaveLength(1);
    const { source, scoping } = savedScopings[0];
    expect(source).toEqual({
      branch: BRANCH,
      path: `cadrages/${ID}/cadrage.md`,
      sha: "sha-1",
    });
    expect(scoping.title).toBe("Un titre corrigé");
    expect(scoping.domains).toEqual(["d"]);
    expect(scoping.links).toEqual([
      {
        tag: "carte_trello",
        url: "https://trello.com/c/abc",
        name: "La carte",
      },
    ]);
    expect(scoping.unknownSections).toContain("Une section libre.");
    expect(scoping.impacts).toEqual([
      {
        target: "RG-nouvelle",
        kind: "regle",
        operation: "cree",
        statement: "L'énoncé.",
      },
      { target: "ADR-001", kind: "adr", operation: "touche", statement: "" },
    ]);
    expect(w.find(".succes").text()).toContain(m.saved);
  });

  it("builds the next save on the version the last one returned", async () => {
    const w = await mountEditor();

    await save(w);
    await save(w);

    expect(savedScopings.map((s) => s.source.sha)).toEqual(["sha-1", "sha-2"]);
  });

  it("does not rewrite a decision nobody touched", async () => {
    const w = await mountEditor();

    await save(w);

    expect(savedDecisions).toEqual([]);
  });

  it("rewrites a changed decision over the version it was read at", async () => {
    const w = await mountEditor();
    await field(w, "dtitre0").setValue("Où ranger les pièces jointes");

    await save(w);

    expect(savedDecisions).toEqual([
      {
        id: "01-question",
        decision: expect.objectContaining({
          title: "Où ranger les pièces jointes",
        }),
        sha: "sha-d1",
      },
    ]);
  });

  it("writes a new decision under its number, without a version", async () => {
    decisionsOnBranch = [];
    const w = await mountEditor();
    const addButtons = w
      .findAll("button")
      .filter((b) => b.text().endsWith(m.add));
    await addButtons[1].trigger("click");
    await field(w, "dtitre0").setValue("Une nouvelle question");

    await save(w);

    expect(savedDecisions).toEqual([
      {
        id: "01-",
        decision: expect.objectContaining({ title: "Une nouvelle question" }),
        sha: undefined,
      },
    ]);
  });

  it("deletes from the repo a decision removed from the form", async () => {
    const w = await mountEditor();

    await button(w, m.removeDecision).trigger("click");
    await save(w);

    expect(deleted).toEqual([path("01-question")]);
  });

  it("shows why a save failed, and does not claim it succeeded", async () => {
    saveFails = new GithubError("Le cadrage a été modifié entre-temps.", 409);
    const w = await mountEditor();

    await save(w);

    expect(w.find(".erreur").text()).toContain(
      "Le cadrage a été modifié entre-temps.",
    );
    expect(w.find(".succes").exists()).toBe(false);
  });
});

describe("The options of a decision", () => {
  async function savedAfter(
    edit: (w: VueWrapper) => Promise<void>,
  ): Promise<EditableDecision> {
    const w = await mountEditor();
    await edit(w);
    await save(w);
    return savedDecisions[0].decision;
  }

  it("keep the chosen one chosen when it is renamed", async () => {
    const d = await savedAfter((w) =>
      field(w, "oid0-0").setValue("dans-le-depot"),
    );

    expect(d.chosenOption).toBe("dans-le-depot");
  });

  it("release the choice when the chosen one is removed", async () => {
    const d = await savedAfter(async (w) => {
      await w.findAll(`[aria-label="${m.removeOption}"]`)[0].trigger("click");
    });

    expect(d.options.map((o) => o.id)).toEqual(["ailleurs"]);
    expect(d.chosenOption).toBeNull();
  });

  it("move the choice to the option marked, and release it when marked again", async () => {
    const moved = await savedAfter(async (w) => {
      await w.findAll(".marque")[1].trigger("click");
    });
    expect(moved.chosenOption).toBe("ailleurs");

    savedDecisions = [];
    const released = await savedAfter(async (w) => {
      await w.findAll(".marque")[0].trigger("click");
    });
    expect(released.chosenOption).toBeNull();
  });

  it("add an empty option, which cannot be chosen before it has a name", async () => {
    const w = await mountEditor();

    await button(w, m.option).trigger("click");

    const marks = w.findAll(".marque");
    expect(marks).toHaveLength(3);
    expect(marks[2].attributes("disabled")).toBeDefined();
  });
});

describe("Changing the status from the editor", () => {
  it("asks for the toggle, and shows the new status", async () => {
    const w = await mountEditor();

    await w.findAll(".cycle-actions button")[0].trigger("click");
    await settle();

    expect(statusChanges).toEqual(["en_relecture"]);
    expect(w.find(".cycle-etat strong").text()).toBe("En relecture");
  });

  it("says the pull request did not toggle, and keeps the status", async () => {
    toggleFails = true;
    const w = await mountEditor();

    await w.findAll(".cycle-actions button")[0].trigger("click");
    await settle();

    expect(w.text()).toContain(m.toggleFailed);
    expect(w.find(".cycle-etat strong").text()).toBe("Brouillon");
  });

  it("is not offered while the scoping would not pass the check", async () => {
    const w = await mountEditor();
    await field(w, "titre").setValue("");

    expect(w.text()).toContain(m.mustBeConsistent);
    expect(
      w.findAll(".cycle-actions button")[0].attributes("disabled"),
    ).toBeDefined();
  });
});
