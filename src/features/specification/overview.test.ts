import { flushPromises, mount } from "@vue/test-utils";
import { beforeEach, describe, expect, it } from "vitest";
import { createMemoryHistory } from "vue-router";
import { provideHttpTesting } from "../../core/http/http-testing";
import { LocaleService } from "../../core/i18n/locale.service";
import { inject, provide } from "../../core/injection";
import {
  DEFAULT_LINK_TAGS,
  type Scoping,
  type Specification,
  type Rule,
} from "../../core/model/model";
import { SpecificationStore } from "../../core/repo/specification.store";
import { RepoConfig } from "../../core/repo/repo-config";
import { COMPOSITION, compose } from "../../extension/composer";
import type { Extension, FeatureFilter } from "../../extension/extension";
import { signal } from "../../core/signals";
import { createAppRouter } from "../../router";
import SpecificationPage from "./SpecificationPage.vue";

/**
 * The specification's entry page — RG-vue-ensemble-fonctionnelle.
 *
 * What is tested here is that it shows what is moving before what is, the scopings in progress separately, and that a feature is reached without going through its domain's page.
 */

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

function rule(id: string, features: string[]): [string, Rule] {
  return [
    id,
    {
      id,
      status: "actif",
      features,
      statement: "",
      createdBy: null,
      modifiedBy: [],
      applies: [],
    },
  ];
}

function specification(scopings: Scoping[]): Specification {
  return {
    project: {
      name: "Test",
      description: "",
      codeRepos: [],
      prefix: null,
      citedRepos: [],
    },
    settings: {
      tokenProtection: "proposee",
      linkTags: DEFAULT_LINK_TAGS,
    },
    domains: new Map([
      [
        "facturation",
        {
          id: "facturation",
          name: "Facturation",
          description: "Les factures.",
        },
      ],
      [
        "clients",
        { id: "clients", name: "Clients", description: "Les clients." },
      ],
    ]),
    features: new Map([
      [
        "relance",
        {
          id: "relance",
          name: "Relance des impayés",
          domains: ["facturation"],
          description: "",
          unrecognisedKeys: { palier: "haut" },
        },
      ],
      [
        "litiges",
        {
          id: "litiges",
          name: "Litiges",
          domains: ["facturation", "clients"],
          description: "",
          unrecognisedKeys: {},
        },
      ],
    ]),
    rules: new Map([
      rule("RG-delai", ["relance"]),
      rule("RG-limite", ["relance", "litiges"]),
      rule("RG-mediation", ["litiges"]),
    ]),
    decisions: new Map(),
    architecture: new Map(),
    scopings: new Map(scopings.map((c) => [c.id, c])),
    anomalies: [],
  };
}

const DELIVERED = [
  scoping("2026-001", "Le socle"),
  scoping("2026-002", "Relancer deux fois"),
  scoping("2026-003", "Relancer trois fois"),
  scoping("2026-004", "Ouvrir les litiges"),
];

const IN_PROGRESS = scoping("2026-005", "Arbitrer les litiges", {
  status: "en_relecture",
  provenance: {
    branch: "cadrage-2026-005",
    pullRequest: 12,
    draft: false,
  },
});

async function mountView(
  scopings: Scoping[],
  extensions: readonly Extension[] = [],
): Promise<HTMLElement> {
  provide(COMPOSITION, compose(extensions));
  const store = inject(SpecificationStore);
  store.specification.set(specification(scopings));
  store.state.set("pret");
  // The address's repo is the one already open, and the store is ready: the guard reloads nothing.
  const router = createAppRouter(createMemoryHistory());
  await router.push("/org/depot/referentiel");
  await router.isReady();
  const view = mount(SpecificationPage, { global: { plugins: [router] } });
  await flushPromises();
  return view.element as HTMLElement;
}

function ids(el: Element | null): string[] {
  return [...(el?.querySelectorAll(".cid") ?? [])].map(
    (c) => c.textContent?.trim() ?? "",
  );
}

describe("The specification overview", () => {
  beforeEach(() => {
    provideHttpTesting();
    inject(RepoConfig).saveRepo({ owner: "org", repo: "depot" });
  });

  describe("what is moving", () => {
    it("shows the last three delivered scopings, by identifier", async () => {
      const el = await mountView([...DELIVERED, IN_PROGRESS]);

      expect(ids(el.querySelector(".livres"))).toEqual([
        "2026-004",
        "2026-003",
        "2026-002",
      ]);
    });

    it("shows the scopings in progress separately, marked with their pull request", async () => {
      const el = await mountView([...DELIVERED, IN_PROGRESS]);

      const inProgress = el.querySelector(".en-cours");
      expect(ids(inProgress)).toEqual(["2026-005"]);
      expect(inProgress?.textContent).toContain("#12");
      expect(ids(el.querySelector(".livres"))).not.toContain("2026-005");
    });

    it("keeps the slot for in-progress ones, and says what it would hold", async () => {
      const el = await mountView(DELIVERED);

      const inProgress = el.querySelector(".en-cours");
      expect(inProgress).not.toBeNull();
      expect(inProgress?.textContent).toContain(
        "Aucun cadrage n’est en discussion",
      );
      expect(
        inProgress?.querySelector('a[href$="/cadrages/nouveau"]'),
      ).not.toBeNull();
    });

    it("comes before the domains", async () => {
      const el = await mountView(DELIVERED);

      const moves = el.querySelector(".bouge")!;
      const domains = el.querySelector(".grille")!;
      expect(
        moves.compareDocumentPosition(domains) &
          Node.DOCUMENT_POSITION_FOLLOWING,
      ).toBeTruthy();
    });
  });

  describe("the domains", () => {
    it("list their features and their number of rules", async () => {
      const el = await mountView(DELIVERED);

      const billing = [...el.querySelectorAll(".carte")].find((c) =>
        c.querySelector("h2")?.textContent?.includes("Facturation"),
      )!;
      const lines = [...billing.querySelectorAll(".fonctionnalites li")].map(
        (l) => [
          l.querySelector("a")?.textContent?.trim(),
          l.querySelector(".aussi")?.textContent?.trim() ?? null,
          l.querySelector(".nb")?.textContent?.trim(),
        ],
      );
      expect(lines).toEqual([
        ["Litiges", "· aussi Clients", "2"],
        ["Relance des impayés", null, "2"],
      ]);
      expect(
        billing.querySelector('a[href$="/referentiel/fonctionnalite/relance"]'),
      ).not.toBeNull();
    });

    it("lead to their page by their name, which carries their colour", async () => {
      const el = await mountView(DELIVERED);

      const name = el.querySelector<HTMLAnchorElement>(".carte h2 a")!;
      expect(name.getAttribute("href")).toMatch(/\/referentiel\/domaine\//);
      expect(name.closest(".carte")!.getAttribute("style")).toContain(
        "--pc-domaine",
      );
    });
  });

  describe("in English", () => {
    beforeEach(() => inject(LocaleService).choice.set("en"));

    it("titles the page and its panels in English", async () => {
      const el = await mountView(DELIVERED);
      const text = el.textContent ?? "";

      expect(text).toContain("Functional specification");
      expect(text).toContain("2 domains · 2 features · 3 active rules");
      expect(text).toContain("Recently delivered");
      expect(text).toContain("No scoping is under discussion");
      expect(text).toContain("also Clients");
      expect(text).not.toContain("Référentiel fonctionnel");
      expect(text).not.toContain("En cours");
      expect(el.querySelector(".bouge")?.getAttribute("aria-label")).toBe(
        "What is moving",
      );
    });
  });

  /**
   * A filter an extension contributes above the list of features — ADR-extensions-commerciales, scoping 2026-069. The page gives its form and applies it; the extension alone knows which frontmatter key it reads and what it means.
   */
  describe("a contributed feature filter", () => {
    const filterVisible = signal(true);

    const tier: FeatureFilter = {
      id: "filtre-factice",
      label: { fr: "Palier", en: "Tier" },
      visible: () => filterVisible(),
      options: [
        {
          id: "haut",
          label: { fr: "Haut", en: "High" },
          matches: (f) => f.unrecognisedKeys["palier"] === "haut",
        },
        {
          id: "sans",
          label: { fr: "Sans palier", en: "No tier" },
          matches: (f) => f.unrecognisedKeys["palier"] === undefined,
        },
      ],
    };
    const fake: Extension = {
      id: "factice",
      pages: { featureFilters: [tier] },
    };

    beforeEach(() => filterVisible.set(true));

    function shownFeatures(el: HTMLElement): string[] {
      return [...el.querySelectorAll(".fonctionnalites li a")].map(
        (a) => a.textContent?.trim() ?? "",
      );
    }

    function combobox(el: HTMLElement): HTMLElement {
      return el.querySelector<HTMLElement>('.filtres [role="combobox"]')!;
    }

    async function press(el: HTMLElement, key: string) {
      combobox(el).dispatchEvent(
        new KeyboardEvent("keydown", { key, bubbles: true }),
      );
      await flushPromises();
    }

    /** The choices, read from the list the keyboard opens. */
    async function listOptions(el: HTMLElement): Promise<string[]> {
      await press(el, "Enter");
      const options = [...document.querySelectorAll('[role="option"]')].map(
        (o) => o.textContent?.trim() ?? "",
      );
      await press(el, "Escape");
      return options;
    }

    /** Moves the choice by the arrow keys, list closed, as a keyboard user does. */
    async function move(el: HTMLElement, steps: number) {
      for (let i = 0; i < Math.abs(steps); i++)
        await press(el, steps > 0 ? "ArrowDown" : "ArrowUp");
    }

    function status(el: HTMLElement): string {
      return (
        el.querySelector('.filtres [role="status"]')?.textContent?.trim() ?? ""
      );
    }

    it("is absent when no extension contributes one", async () => {
      const el = await mountView(DELIVERED);
      expect(el.querySelector(".filtres")).toBeNull();
    });

    it("is a labelled choice above the domains, which shows every feature at first", async () => {
      const el = await mountView(DELIVERED, [fake]);

      expect(combobox(el).getAttribute("aria-label")).toBe("Palier");
      expect(combobox(el).textContent).toContain("Toutes");
      expect(await listOptions(el)).toEqual(["Toutes", "Haut", "Sans palier"]);
      expect(
        el
          .querySelector(".filtres")!
          .compareDocumentPosition(el.querySelector(".grille")!) &
          Node.DOCUMENT_POSITION_FOLLOWING,
      ).toBeTruthy();
      expect(shownFeatures(el)).toEqual([
        "Litiges",
        "Litiges",
        "Relance des impayés",
      ]);
    });

    it("keeps only the features the chosen option matches, and says how many", async () => {
      const el = await mountView(DELIVERED, [fake]);

      await move(el, 1);
      expect(shownFeatures(el)).toEqual(["Relance des impayés"]);
      expect(status(el)).toBe("1 fonctionnalité sur 2");

      await move(el, 1);
      expect(shownFeatures(el)).toEqual(["Litiges", "Litiges"]);
      expect(status(el)).toBe("1 fonctionnalité sur 2");

      await move(el, -2);
      expect(shownFeatures(el)).toEqual([
        "Litiges",
        "Litiges",
        "Relance des impayés",
      ]);
      expect(status(el)).toBe("");
    });

    it("stops filtering once its extension hides it", async () => {
      const el = await mountView(DELIVERED, [fake]);
      await move(el, 1);

      filterVisible.set(false);
      await flushPromises();
      expect(el.querySelector(".filtres")).toBeNull();
      expect(shownFeatures(el)).toEqual([
        "Litiges",
        "Litiges",
        "Relance des impayés",
      ]);
    });

    it("speaks English", async () => {
      inject(LocaleService).choice.set("en");
      const el = await mountView(DELIVERED, [fake]);

      expect(combobox(el).getAttribute("aria-label")).toBe("Tier");
      expect(await listOptions(el)).toEqual(["All", "High", "No tier"]);
      await move(el, 1);
      expect(status(el)).toBe("1 feature of 2");
    });
  });
});
