import { flushPromises, mount } from "@vue/test-utils";
import { beforeEach, describe, expect, it } from "vitest";
import { createMemoryHistory } from "vue-router";
import {
  HttpTestingController,
  provideHttpTesting,
  settle,
} from "../../core/http/http-testing";
import { inject } from "../../core/injection";
import { DEFAULT_LINK_TAGS, type Scoping } from "../../core/model/model";
import { SpecificationStore } from "../../core/repo/specification.store";
import { RepoConfig } from "../../core/repo/repo-config";
import { createAppRouter } from "../../router";
import DomainPage from "./DomainPage.vue";
import FeaturePage from "./FeaturePage.vue";
import RoadmapItemsSection from "./RoadmapItemsSection.vue";

/**
 * The « À venir » section of a domain or a feature —
 * RG-pistes-a-part (scoping 2026-058).
 *
 * What is tested: that it stays collapsed and apart from what is in effect, that
 * it arranges its roadmap items by horizon under a label saying nothing is decided,
 * that a roadmap item in progress leads to its scoping, and that emptiness as
 * well as a missing permission are stated instead of kept quiet.
 */
const ISSUES_URL =
  "https://api.github.com/repos/org/depot/issues?labels=piste&state=open&per_page=100&page=1";

function issue(number: number, labels: string[], milestone: string | null) {
  return {
    number: number,
    title: `Commenter un cadrage ${number}`,
    html_url: `https://github.com/org/depot/issues/${number}`,
    labels: ["piste", ...labels].map((name) => ({ name })),
    milestone: milestone ? { title: milestone } : null,
  };
}

const IN_PROGRESS: Scoping = {
  id: "2026-071",
  title: "Commenter",
  status: "brouillon",
  domains: ["cadrage"],
  links: [
    { tag: "piste", url: "https://github.com/org/depot/issues/12", name: "" },
  ],
  impacts: [],
  goal: "",
  journey: "",
  statements: new Map(),
  decisions: [],
  attachments: [],
  misc: [],
};

let http: HttpTestingController;

async function prepare() {
  const store = inject(SpecificationStore);
  store.specification.set({
    project: { name: "Test", description: "", codeRepos: [], prefix: null },
    settings: {
      access: "jeton_personnel",
      identity: null,
      tokenProtection: "proposee",
      linkTags: DEFAULT_LINK_TAGS,
    },
    domains: new Map([
      ["cadrage", { id: "cadrage", name: "Cadrage", description: "" }],
    ]),
    features: new Map([
      [
        "redaction",
        {
          id: "redaction",
          name: "Rédaction",
          domains: ["cadrage"],
          description: "",
        },
      ],
    ]),
    rules: new Map(),
    decisions: new Map(),
    architecture: new Map(),
    scopings: new Map([[IN_PROGRESS.id, IN_PROGRESS]]),
    anomalies: [],
  });
  store.state.set("pret");
  const router = createAppRouter(createMemoryHistory());
  await router.push("/org/depot/referentiel");
  await router.isReady();
  return router;
}

async function mountSection(
  response: (r: ReturnType<HttpTestingController["expectOne"]>) => void,
) {
  const router = await prepare();
  const view = mount(RoadmapItemsSection, {
    props: { collection: "domains", id: "cadrage" },
    global: { plugins: [router] },
  });
  await settle();
  response(http.expectOne(ISSUES_URL));
  await flushPromises();
  return view;
}

describe("The « À venir » section", () => {
  beforeEach(() => {
    http = provideHttpTesting();
    inject(RepoConfig).saveRepo({ owner: "org", repo: "depot" });
  });

  it("shows collapsed, with the number of roadmap items", async () => {
    const view = await mountSection((r) =>
      r.flush([
        issue(12, ["domaine/cadrage"], "ensuite"),
        issue(13, ["domaine/cadrage"], null),
        issue(14, ["domaine/autre"], null),
      ]),
    );

    const toggle = view.get("button.bascule");
    expect(toggle.text()).toContain("À venir");
    expect(toggle.text()).toContain("2");
    expect(toggle.attributes("aria-expanded")).toBe("false");
    expect(view.find(".piste").exists()).toBe(false);
  });

  it("expanded, arranges roadmap items by horizon and says nothing is decided there", async () => {
    const view = await mountSection((r) =>
      r.flush([
        issue(13, ["domaine/cadrage"], null),
        issue(12, ["domaine/cadrage"], "Maintenant"),
      ]),
    );
    await view.get("button.bascule").trigger("click");

    expect(view.text()).toContain("rien n’y est décidé");
    const horizons = view.findAll(".horizon").map((h) => h.text());
    expect(horizons).toEqual(["Maintenant", "Non classées"]);
    const links = view.findAll(".piste a.issue");
    expect(links.map((a) => a.attributes("href"))).toEqual([
      "https://github.com/org/depot/issues/12",
      "https://github.com/org/depot/issues/13",
    ]);
  });

  it("leads a roadmap item in progress to the scoping handling it", async () => {
    const view = await mountSection((r) =>
      r.flush([issue(12, ["domaine/cadrage"], "ensuite")]),
    );
    await view.get("button.bascule").trigger("click");

    const scoping = view.get(".piste a.cadrage");
    expect(scoping.text()).toContain("2026-071");
    expect(scoping.attributes("href")).toBe("/org/depot/cadrages/2026-071");
  });

  it("without roadmap items, says what it would hold", async () => {
    const view = await mountSection((r) => r.flush([]));
    await view.get("button.bascule").trigger("click");

    expect(view.text()).toContain("Aucune piste");
    expect(view.text()).toContain("domaine/cadrage");
  });

  it("names the missing permission when the token cannot read issues", async () => {
    const view = await mountSection((r) =>
      r.flush({ message: "Resource not accessible" }, { status: 403 }),
    );
    await view.get("button.bascule").trigger("click");

    expect(view.text()).toContain("Issues");
    expect(view.text()).not.toContain("Aucune piste");
  });
});

describe("The place of the section", () => {
  beforeEach(() => {
    http = provideHttpTesting();
    inject(RepoConfig).saveRepo({ owner: "org", repo: "depot" });
  });

  it("comes last in a domain", async () => {
    const router = await prepare();
    await router.push("/org/depot/referentiel/domaine/cadrage");
    const view = mount(DomainPage, { global: { plugins: [router] } });
    await flushPromises();

    const sections = view.findAll("h2, .pistes");
    expect(sections.at(-1)?.classes()).toContain("pistes");
  });

  it("comes last in a feature", async () => {
    const router = await prepare();
    await router.push("/org/depot/referentiel/fonctionnalite/redaction");
    const view = mount(FeaturePage, { global: { plugins: [router] } });
    await flushPromises();

    const sections = view.findAll("h2, .pistes");
    expect(sections.at(-1)?.classes()).toContain("pistes");
  });
});
