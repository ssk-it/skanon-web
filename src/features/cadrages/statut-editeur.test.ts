import { flushPromises, mount, type VueWrapper } from "@vue/test-utils";
import { describe, expect, it } from "vitest";
import { createMemoryHistory } from "vue-router";
import { provideHttpTesting } from "../../core/http/http-testing";
import { inject, provide } from "../../core/injection";
import {
  DEFAULT_LINK_TAGS,
  type Scoping,
  type Specification,
} from "../../core/model/model";
import {
  AuthoringService,
  listToggles,
} from "../../core/repo/redaction.service";
import { SpecificationStore } from "../../core/repo/referentiel.store";
import { RepoConfig } from "../../core/repo/repo-config";
import { createAppRouter } from "../../routeur";
import EditScopingPage from "./EditerCadragePage.vue";

/**
 * Le statut dans l'éditeur — RG-statuts-cadrage et RG-bascule-de-statut.
 *
 * Le statut ne s'écrit plus dans le fichier : il se lit sur la demande de fusion. L'éditeur le lisait encore dans un champ `statut:` que plus aucun cadrage ne porte, et montrait donc « Brouillon » quoi qu'il en soit — avec, en face, une bascule vers la relecture même pour un cadrage déjà relu.
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

describe("Le statut dans l’éditeur", () => {
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

  it("montre le statut que porte la demande de fusion", async () => {
    const el = await stable(await mountView([scoping("en_relecture")]));

    expect(displayedStatus(el)).toBe("En relecture");
    expect(toggles(el)).toEqual(["Brouillon"]);
  });

  it("ne propose jamais « Validée », et laisse reprendre un cadrage validé", async () => {
    const el = await stable(await mountView([scoping("validee")]));

    expect(displayedStatus(el)).toBe("Validée");
    expect(toggles(el)).toEqual(["Brouillon"]);
  });

  it("suit le statut quand les branches finissent d’arriver", async () => {
    const f = await mountView([]);
    let el = await stable(f);
    expect(displayedStatus(el)).toBe("Brouillon");

    const store = inject(SpecificationStore);
    store.specification.set(specification([scoping("en_relecture")]));
    el = await stable(f);

    expect(displayedStatus(el)).toBe("En relecture");
  });
});
