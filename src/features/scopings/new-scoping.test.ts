import { flushPromises, mount } from "@vue/test-utils";
import { beforeEach, describe, expect, it } from "vitest";
import { createMemoryHistory } from "vue-router";
import { provideHttpTesting } from "../../core/http/http-testing";
import { LocaleService } from "../../core/i18n/locale.service";
import { inject, provide } from "../../core/injection";
import { DEFAULT_LINK_TAGS } from "../../core/model/model";
import { AuthoringService } from "../../core/repo/authoring.service";
import { RepoConfig } from "../../core/repo/repo-config";
import { SpecificationStore } from "../../core/repo/specification.store";
import { createAppRouter } from "../../router";
import NewScopingPage from "./NewScopingPage.vue";

/** Opening a scoping: the form names what is missing rather than leaving an inert button. */
describe("The new scoping form", () => {
  beforeEach(() => {
    provideHttpTesting();
    provide(AuthoringService, { nextId: () => "2026-060" });
    inject(RepoConfig).saveRepo({ owner: "org", repo: "depot" });
    const store = inject(SpecificationStore);
    store.specification.update((s) => ({
      ...s,
      settings: { ...s.settings, linkTags: DEFAULT_LINK_TAGS },
      domains: new Map([["d", { id: "d", name: "D", description: "" }]]),
    }));
    store.state.set("pret");
  });

  async function mountView(): Promise<HTMLElement> {
    const router = createAppRouter(createMemoryHistory());
    await router.push("/org/depot/cadrages/nouveau");
    await router.isReady();
    const f = mount(NewScopingPage, { global: { plugins: [router] } });
    await flushPromises();
    return f.element as HTMLElement;
  }

  it("names what is still missing", async () => {
    const text = (await mountView()).textContent ?? "";

    expect(text).toContain("Nouveau cadrage");
    expect(text).toContain(
      "Il manque encore : un titre, un objectif, un parcours.",
    );
    expect(text).toContain("Créer le cadrage");
  });

  describe("in English", () => {
    beforeEach(() => inject(LocaleService).choice.set("en"));

    it("labels the form and names what is missing in English", async () => {
      const el = await mountView();
      const text = el.textContent ?? "";

      expect(text).toContain("New scoping");
      expect(text).toContain("Still missing: a title, a goal, a journey.");
      expect(text).toContain("Create the scoping");
      expect(text).toContain("Cancel");
      expect(text).toContain("User journey");
      expect(text).toContain("Separated by commas. Known: d");
      expect(el.querySelector(".note")?.textContent).toContain(
        "cadrage/2026-060",
      );
      for (const french of ["Nouveau cadrage", "Il manque", "Annuler"])
        expect(text).not.toContain(french);
    });
  });
});
