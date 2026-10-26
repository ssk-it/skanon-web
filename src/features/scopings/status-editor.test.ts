import { flushPromises, mount, type VueWrapper } from "@vue/test-utils";
import { beforeEach, describe, expect, it } from "vitest";
import { createMemoryHistory } from "vue-router";
import { provideHttpTesting } from "../../core/http/http-testing";
import { LocaleService } from "../../core/i18n/locale.service";
import { inject, provide } from "../../core/injection";
import {
  DEFAULT_LINK_TAGS,
  type Scoping,
  type Specification,
} from "../../core/model/model";
import {
  AuthoringService,
  listToggles,
} from "../../core/repo/authoring.service";
import { SpecificationStore } from "../../core/repo/specification.store";
import { RepoConfig } from "../../core/repo/repo-config";
import { createAppRouter } from "../../router";
import EditScopingPage from "./EditScopingPage.vue";

/**
 * The status in the editor — RG-statuts-cadrage and RG-bascule-de-statut.
 *
 * The status is no longer written in the file: it is read on the pull request. The editor still read it from a `statut:` field that no scoping carries any more, and therefore showed « Brouillon » regardless — with, opposite, a toggle to review even for an already reviewed scoping.
 */

const CONTENT = `---
id: 2026-050
titre: Un cadrage en relecture
domaines: [d]
---

## Objectif

Un objectif.
`;

function scoping(status: Scoping["status"]): Scoping {
  return {
    id: "2026-050",
    title: "Un cadrage en relecture",
    status: status,
    domains: ["d"],
    links: [],
    impacts: [],
    goal: "Un objectif.",
    journey: "",
    statements: new Map(),
    decisions: [],
    attachments: [],
    misc: [],
    provenance: {
      branch: "cadrage/2026-050",
      pullRequest: 9,
      draft: status === "brouillon",
    },
  };
}

function specification(scopings: Scoping[]): Specification {
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
    decisions: new Map(),
    architecture: new Map(),
    scopings: new Map(scopings.map((c) => [c.id, c])),
    anomalies: [],
  };
}

describe("The status in the editor", () => {
  async function mountView(scopings: Scoping[]): Promise<VueWrapper> {
    provideHttpTesting();
    provide(AuthoringService, {
      loadForEditing: async () => ({
        source: {
          branch: "cadrage/2026-050",
          path: "cadrages/2026-050/cadrage.md",
          sha: "x",
        },
        content: CONTENT,
        context: null,
        mainBranch: "main",
      }),
      loadDecisions: async () => [],
      possibleTransitions: listToggles,
    });
    inject(RepoConfig).saveRepo({ owner: "org", repo: "depot" });
    const store = inject(SpecificationStore);
    store.specification.set(specification(scopings));
    store.state.set("pret");

    const router = createAppRouter(createMemoryHistory());
    await router.push("/org/depot/cadrages/2026-050/editer");
    await router.isReady();
    return mount(EditScopingPage, { global: { plugins: [router] } });
  }

  async function stable(f: VueWrapper): Promise<HTMLElement> {
    for (let i = 0; i < 10; i++) await Promise.resolve();
    await flushPromises();
    return f.element as HTMLElement;
  }

  function displayedStatus(el: HTMLElement): string {
    return el.querySelector(".cycle-etat strong")?.textContent?.trim() ?? "";
  }

  function toggles(el: HTMLElement): string[] {
    return [...el.querySelectorAll(".cycle-actions button")].map(
      (b) => b.textContent?.trim() ?? "",
    );
  }

  it("shows the status the pull request carries", async () => {
    const el = await stable(await mountView([scoping("en_relecture")]));

    expect(displayedStatus(el)).toBe("En relecture");
    expect(toggles(el)).toEqual(["Brouillon"]);
  });

  it("never offers « Validée », and lets an approved scoping be resumed", async () => {
    const el = await stable(await mountView([scoping("validee")]));

    expect(displayedStatus(el)).toBe("Validée");
    expect(toggles(el)).toEqual(["Brouillon"]);
  });

  it("follows the status when the branches finish arriving", async () => {
    const f = await mountView([]);
    let el = await stable(f);
    expect(displayedStatus(el)).toBe("Brouillon");

    const store = inject(SpecificationStore);
    store.specification.set(specification([scoping("en_relecture")]));
    el = await stable(f);

    expect(displayedStatus(el)).toBe("En relecture");
  });

  describe("in English", () => {
    beforeEach(() => inject(LocaleService).choice.set("en"));

    it("names the status, its toggles and the form in English", async () => {
      const el = await stable(await mountView([scoping("en_relecture")]));
      const text = el.textContent ?? "";

      expect(displayedStatus(el)).toBe("In review");
      expect(toggles(el)).toEqual(["Draft"]);
      expect(el.querySelector(".cycle-libelle")?.textContent).toBe("Status");
      expect(el.querySelector(".type")?.textContent).toBe("Resume a scoping");
      expect(
        [...el.querySelectorAll("h2.section")].map((h) => h.textContent),
      ).toEqual(["Impacts on rules", "Decisions"]);
      // the journey is empty in the fixture: the editor names it
      expect(
        [...el.querySelectorAll(".problemes li")].map((l) => l.textContent),
      ).toContain("A journey is missing.");
      expect(text).toContain(
        "The scoping must be consistent before changing status.",
      );
      expect(text).toContain("Save");
      for (const french of ["Statut", "Décisions", "Enregistrer", "Il manque"])
        expect(text).not.toContain(french);
    });
  });
});
