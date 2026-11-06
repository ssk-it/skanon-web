import { flushPromises, mount } from "@vue/test-utils";
import { beforeEach, describe, expect, it } from "vitest";
import { createMemoryHistory } from "vue-router";
import { provideHttpTesting } from "../../core/http/http-testing";
import { LocaleService } from "../../core/i18n/locale.service";
import { inject, provide } from "../../core/injection";
import {
  DEFAULT_LINK_TAGS,
  type Feature,
  type Specification,
} from "../../core/model/model";
import { RepoConfig } from "../../core/repo/repo-config";
import { SpecificationStore } from "../../core/repo/specification.store";
import { signal } from "../../core/signals";
import { COMPOSITION, compose } from "../../extension/composer";
import type { Extension, FeatureSection } from "../../extension/extension";
import { createAppRouter } from "../../router";
import FeaturePage from "./FeaturePage.vue";

/**
 * A section an extension contributes to a feature's page — ADR-extensions-commerciales, scoping 2026-069.
 *
 * The page gives the section its form and its place, between the feature's description and its rules; the extension alone knows which frontmatter key it reads, and what it says of it.
 */

function feature(id: string, unrecognisedKeys: Feature["unrecognisedKeys"]) {
  return [
    id,
    {
      id,
      name: `Fonctionnalité ${id}`,
      domains: [],
      description: "",
      unrecognisedKeys,
    },
  ] as const;
}

function specification(): Specification {
  return {
    project: {
      name: "Test",
      description: "",
      codeRepos: [],
      prefix: null,
      citedRepos: [],
    },
    settings: { tokenProtection: "proposee", linkTags: DEFAULT_LINK_TAGS },
    domains: new Map(),
    features: new Map([
      feature("relance", { palier: "haut" }),
      feature("litiges", {}),
    ]),
    rules: new Map(),
    decisions: new Map(),
    architecture: new Map(),
    scopings: new Map(),
    anomalies: [],
  };
}

const sectionVisible = signal(true);

/** Says the tier a feature carries, and flags one it does not recognise. */
const tierSection: FeatureSection = {
  id: "section-factice",
  heading: { fr: "Palier", en: "Tier" },
  visible: () => sectionVisible(),
  notes: (f) => {
    const tier = f.unrecognisedKeys["palier"];
    if (tier === undefined) return [];
    if (tier === "haut")
      return [{ text: { fr: "Palier haut.", en: "High tier." } }];
    return [
      {
        icon: "warning_amber",
        text: { fr: "Palier non reconnu.", en: "Unrecognised tier." },
      },
    ];
  },
};
const fake: Extension = {
  id: "factice",
  pages: { featureSections: [tierSection] },
};

async function mountView(
  id: string,
  extensions: readonly Extension[] = [fake],
): Promise<HTMLElement> {
  provide(COMPOSITION, compose(extensions));
  const store = inject(SpecificationStore);
  store.specification.set(specification());
  store.state.set("pret");
  const router = createAppRouter(createMemoryHistory());
  await router.push(`/org/depot/referentiel/fonctionnalite/${id}`);
  await router.isReady();
  const view = mount(FeaturePage, { global: { plugins: [router] } });
  await flushPromises();
  return view.element as HTMLElement;
}

describe("A contributed feature section", () => {
  beforeEach(() => {
    provideHttpTesting();
    inject(RepoConfig).saveRepo({ owner: "org", repo: "depot" });
    sectionVisible.set(true);
  });

  it("is a titled region of the page, which says what the extension reads in the feature", async () => {
    const el = await mountView("relance");

    const section = el.querySelector<HTMLElement>(
      'section[data-apport="section-factice"]',
    )!;
    const heading = section.querySelector("h2")!;
    expect(heading.textContent?.trim()).toBe("Palier");
    expect(section.getAttribute("aria-labelledby")).toBe(heading.id);
    expect(section.textContent).toContain("Palier haut.");
  });

  it("sits between the description and the rules", async () => {
    const el = await mountView("relance");

    const section = el.querySelector('[data-apport="section-factice"]')!;
    const header = el.querySelector(".entete")!;
    const rules = [...el.querySelectorAll("h2.section")].find((h) =>
      h.textContent?.includes("Règles de gestion"),
    )!;
    expect(
      header.compareDocumentPosition(section) &
        Node.DOCUMENT_POSITION_FOLLOWING,
    ).toBeTruthy();
    expect(
      section.compareDocumentPosition(rules) & Node.DOCUMENT_POSITION_FOLLOWING,
    ).toBeTruthy();
  });

  it("shows the icon the extension gives a note", async () => {
    const el = await mountView("relance");
    expect(
      el.querySelector(
        '[data-apport="section-factice"] .material-symbols-outlined',
      ),
    ).toBeNull();

    const store = inject(SpecificationStore);
    store.specification.set({
      ...specification(),
      features: new Map([feature("relance", { palier: ["?"] })]),
    });
    await flushPromises();
    const section = el.querySelector('[data-apport="section-factice"]')!;
    expect(section.textContent).toContain("Palier non reconnu.");
    expect(section.textContent).toContain("warning_amber");
  });

  it("is absent when it has nothing to say about the feature", async () => {
    const el = await mountView("litiges");
    expect(el.querySelector('[data-apport="section-factice"]')).toBeNull();
  });

  it("is absent when its extension hides it", async () => {
    const el = await mountView("relance");
    sectionVisible.set(false);
    await flushPromises();
    expect(el.querySelector('[data-apport="section-factice"]')).toBeNull();
  });

  it("is absent without an extension", async () => {
    const el = await mountView("relance", []);
    expect(el.querySelector("[data-apport]")).toBeNull();
  });

  it("speaks English", async () => {
    inject(LocaleService).choice.set("en");
    const el = await mountView("relance");

    const section = el.querySelector('[data-apport="section-factice"]')!;
    expect(section.querySelector("h2")?.textContent?.trim()).toBe("Tier");
    expect(section.textContent).toContain("High tier.");
  });
});
