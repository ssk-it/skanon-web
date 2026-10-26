import { flushPromises, mount, type VueWrapper } from "@vue/test-utils";
import { describe, expect, it } from "vitest";
import { nextTick } from "vue";
import { createMemoryHistory, createRouter, type Router } from "vue-router";
import { provideHttpTesting } from "../../core/http/http-testing";
import { inject } from "../../core/injection";
import {
  DEFAULT_LINK_TAGS,
  type Scoping,
  type Specification,
} from "../../core/model/model";
import { SpecificationStore } from "../../core/repo/specification.store";
import { RepoConfig } from "../../core/repo/repo-config";
import SearchPalette, { type PaletteData } from "./SearchPalette.vue";

/**
 * The search palette — RG-recherche-a-portee-de-clavier, RG-recherche-perimetre, RG-recherche-en-cours-a-part.
 *
 * What is tested here is what the reader sees: results sorted by kind, scopings in progress apart, and what the palette says when it has nothing to show — silence would pass for a broken search.
 */
const VuePlaceholder = { render: () => "vue" };

function scoping(
  id: string,
  title: string,
  extra: Partial<Scoping> = {},
): Scoping {
  return {
    id,
    title,
    status: "livree",
    domains: [],
    links: [],
    impacts: [],
    goal: "",
    journey: "",
    statements: new Map(),
    decisions: [],
    attachments: [],
    misc: [],
    ...extra,
  };
}

const SPECIFICATION: Specification = {
  project: { name: "Test", description: "", codeRepos: [], prefix: null },
  settings: {
    access: "jeton_personnel",
    identity: null,
    tokenProtection: "proposee",
    linkTags: DEFAULT_LINK_TAGS,
  },
  domains: new Map(),
  features: new Map(),
  rules: new Map([
    [
      "RG-quota",
      {
        id: "RG-quota",
        status: "actif",
        features: [],
        statement: "Le quota anonyme est de soixante appels.",
        createdBy: null,
        modifiedBy: [],
      },
    ],
  ]),
  decisions: new Map(),
  architecture: new Map(),
  scopings: new Map([
    [
      "2026-006",
      scoping("2026-006", "Charger un dépôt sans épuiser le quota", {
        decisions: [
          {
            id: "01-canal",
            title: "Par quel canal lire sans quota ?",
            status: "retenue",
            chosenOption: null,
            description: "",
            options: [],
            body: "",
          },
        ],
      }),
    ],
    [
      "2026-050",
      scoping("2026-050", "Signaler le quota plus tôt", {
        status: "en_relecture",
        provenance: {
          branch: "cadrage-2026-050",
          pullRequest: 61,
          draft: false,
        },
      }),
    ],
  ]),
  anomalies: [],
};

describe("The search palette", () => {
  let router: Router;

  async function mountView(
    data: PaletteData = { onPastState: false },
  ): Promise<VueWrapper> {
    provideHttpTesting();
    // SSK Canon's `{ path: '**' }`: every address leads to an unguarded view; only the palette is tested.
    router = createRouter({
      history: createMemoryHistory(),
      routes: [{ path: "/:autre(.*)*", component: VuePlaceholder }],
    });
    await router.push("/");
    await router.isReady();
    inject(RepoConfig).saveRepo({ owner: "org", repo: "depot" });
    inject(SpecificationStore).specification.set(SPECIFICATION);
    return mount(SearchPalette, {
      props: { data: data },
      global: { plugins: [router] },
    });
  }

  async function typeText(f: VueWrapper, text: string): Promise<HTMLElement> {
    const field = f.element.querySelector("input")!;
    field.value = text;
    field.dispatchEvent(new Event("input"));
    await nextTick();
    return f.element as HTMLElement;
  }

  function groupTitles(el: HTMLElement): string[] {
    return [...el.querySelectorAll(".groupe-titre")].map(
      (g) => g.textContent?.trim() ?? "",
    );
  }

  it("says what it searches before anything is typed", async () => {
    const el = (await mountView()).element as HTMLElement;

    const text = el.textContent ?? "";
    for (const kind of ["règles", "décisions", "architecture", "cadrages"]) {
      expect(text).toContain(kind);
    }
    expect(el.querySelectorAll('[role="option"]').length).toBe(0);
  });

  it("sorts results by kind, and scopings in progress apart", async () => {
    const el = await typeText(await mountView(), "quota");

    expect(groupTitles(el)).toEqual([
      "Règles de gestion",
      "Décisions",
      "Cadrages",
      "En cours",
    ]);
    const inProgress = el.querySelector(".groupe.en-cours")!;
    expect(inProgress.textContent).toContain("2026-050");
    expect(inProgress.textContent).toContain("#61");
    // a scoping under discussion never mixes with the specification
    const delivered = [...el.querySelectorAll(".groupe:not(.en-cours)")].map(
      (g) => g.textContent,
    );
    expect(delivered.join(" ")).not.toContain("2026-050");
  });

  it("says that no result matches, and recalls what it searches", async () => {
    const el = await typeText(await mountView(), "introuvable");

    expect(el.querySelector(".vide")?.textContent).toContain("introuvable");
    expect(el.querySelector(".vide")?.textContent).toContain(
      "cadrages en cours",
    );
  });

  it("says that scopings in progress are still arriving", async () => {
    const f = await mountView();
    inject(SpecificationStore).loadingBranches.set(true);
    const el = await typeText(f, "soixante");

    expect(el.querySelector(".groupe.en-cours")?.textContent).toContain(
      "Lecture des branches",
    );
    // and does not hide what has already been found
    expect(el.textContent).toContain("RG-quota");
  });

  it("warns that its results hold for today when going back in time", async () => {
    const el = (await mountView({ onPastState: true })).element as HTMLElement;

    expect(el.querySelector(".etat-courant")?.textContent).toContain(
      "aujourd’hui",
    );
  });

  it("does not say so on the current state", async () => {
    const el = (await mountView()).element as HTMLElement;

    expect(el.querySelector(".etat-courant")).toBeNull();
  });

  it("leads to the result chosen with the keyboard, at its anchor, and closes", async () => {
    const f = await mountView();
    const el = await typeText(f, "quota");
    const field = el.querySelector("input")!;

    field.dispatchEvent(new KeyboardEvent("keydown", { key: "ArrowDown" }));
    await nextTick();
    field.dispatchEvent(new KeyboardEvent("keydown", { key: "Enter" }));
    await flushPromises();

    // the rule comes first, the scoping's decision right after
    expect(router.currentRoute.value.fullPath).toBe(
      "/org/depot/cadrages/2026-006#decision-01-canal",
    );
    expect(f.emitted("close")).toHaveLength(1);
  });
});
