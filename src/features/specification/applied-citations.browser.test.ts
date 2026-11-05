import { flushPromises, mount, type VueWrapper } from "@vue/test-utils";
import { afterEach, describe, expect, it } from "vitest";
import { page } from "vitest/browser";
import { createMemoryHistory } from "vue-router";
import { close, overflows, violations } from "../../accessibility-testing";
import { provideHttpTesting } from "../../core/http/http-testing";
import { inject, provide } from "../../core/injection";
import {
  DEFAULT_LINK_TAGS,
  type Citation,
  type Rule,
  type Specification,
} from "../../core/model/model";
import {
  CitedSpecifications,
  type CitedRead,
} from "../../core/repo/cited-specifications";
import { RepoConfig } from "../../core/repo/repo-config";
import { SpecificationStore } from "../../core/repo/specification.store";
import { createAppRouter } from "../../router";
import AppliedCitations from "./AppliedCitations.vue";

/**
 * The citations of a rule, in every state, against WCAG 2.2 AA —
 * RG-accessibilite-aa: in both themes, the contrast of the warning states
 * is measured on the rendered page, then narrowed to 320 px wide (1.4.10).
 */
const READABLE: CitedRead = {
  kind: "lu",
  specification: {
    rules: new Map(
      (
        [
          { id: "RG-a-jour", status: "actif", modifiedBy: ["2026-012"] },
          { id: "RG-perimee", status: "actif", modifiedBy: ["2026-031"] },
          { id: "RG-abrogee", status: "abroge", modifiedBy: [] },
        ] as Partial<Rule>[]
      ).map((r) => [r.id!, r as Rule]),
    ),
    decisions: new Map(),
  } as unknown as Specification,
};

const CITATIONS: Citation[] = [
  "RG-a-jour",
  "RG-perimee",
  "RG-abrogee",
  "RG-une-regle-absente-au-nom-particulierement-long",
].map((target) => ({ prefix: "socle", target, scoping: "2026-012" }));

let view: VueWrapper | undefined;

afterEach(() => {
  view?.unmount();
  view = undefined;
  close();
});

async function show(): Promise<HTMLElement> {
  provideHttpTesting();
  inject(RepoConfig).saveRepo({ owner: "org", repo: "appli" });
  provide(CitedSpecifications, {
    read: (repo: { repo: string }) =>
      Promise.resolve<CitedRead>(
        repo.repo === "socle-cadrage"
          ? READABLE
          : { kind: "illisible", reason: "sans-acces" },
      ),
  });
  const store = inject(SpecificationStore);
  store.specification.set({
    project: {
      name: "Appli",
      description: "",
      codeRepos: [],
      prefix: null,
      citedRepos: [
        { prefix: "socle", repo: { owner: "org", repo: "socle-cadrage" } },
        { prefix: "prive", repo: { owner: "org", repo: "prive-cadrage" } },
      ],
    },
    settings: { tokenProtection: "proposee", linkTags: DEFAULT_LINK_TAGS },
    domains: new Map(),
    features: new Map(),
    rules: new Map(),
    decisions: new Map(),
    architecture: new Map(),
    scopings: new Map(),
    anomalies: [],
  });
  store.state.set("pret");
  const router = createAppRouter(createMemoryHistory());
  await router.push("/org/appli/referentiel");
  await router.isReady();

  const main = document.createElement("main");
  document.body.append(main);
  view = mount(AppliedCitations, {
    props: {
      citations: [
        ...CITATIONS,
        { prefix: "prive", target: "RG-fermee", scoping: "2026-002" },
        { prefix: "inconnu", target: "RG-x", scoping: "2026-001" },
      ],
    },
    global: { plugins: [router] },
    attachTo: main,
  });
  await flushPromises();
  return main;
}

describe("citations against WCAG 2.2 AA — RG-accessibilite-aa", () => {
  it.each([["clair"], ["sombre"]])(
    "has no violation axe can see, theme %s",
    async (theme) => {
      document.documentElement.dataset["theme"] = theme;
      const root = await show();
      expect(root.querySelectorAll("li")).toHaveLength(6);
      expect(await violations(root)).toEqual([]);
    },
    30_000,
  );

  it("fits 320 px, without horizontal scrolling", async () => {
    await page.viewport(320, 640);
    await show();
    expect(overflows()).toEqual([]);
  }, 30_000);
});
