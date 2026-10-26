import { flushPromises, mount, type VueWrapper } from "@vue/test-utils";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { createMemoryHistory, type Router } from "vue-router";
import { GithubError, type RepoRef } from "../../core/github/github-client";
import { provideHttpTesting } from "../../core/http/http-testing";
import { LocaleService } from "../../core/i18n/locale.service";
import { inject, provide, resetInjection } from "../../core/injection";
import {
  BootstrapService,
  type TargetCheck,
} from "../../core/repo/bootstrap.service";
import { createAppRouter } from "../../router";
import CreateSpecification from "./CreateSpecification.vue";

/**
 * Creating a specification from the home page (RG-amorcage-depot, scoping
 * 2026-062): the application leads to the platform to create the repo, checks
 * the repo it is given, and opens it — the assistant takes over there. Nothing
 * is read before the author asks (RG-choix-projet-prealable).
 */
describe("Creating a specification from the home page", () => {
  let checked: RepoRef[];
  let answer: () => Promise<TargetCheck>;
  let router: Router;

  beforeEach(() => {
    resetInjection();
    // Opening the repo starts loading it: nothing must leave for the network.
    provideHttpTesting();
    checked = [];
    answer = async () => "ready";
    provide(BootstrapService, {
      checkTarget: async (r: RepoRef) => {
        checked.push(r);
        return answer();
      },
    });
  });

  async function render(): Promise<VueWrapper> {
    router = createAppRouter(createMemoryHistory());
    await router.push("/");
    await router.isReady();
    return mount(CreateSpecification, { global: { plugins: [router] } });
  }

  async function submit(view: VueWrapper, repo: string): Promise<void> {
    await view.find("button.creer").trigger("click");
    await view.find('input[name="depotACreer"]').setValue(repo);
    await view.find("form").trigger("submit");
    await flushPromises();
  }

  it("offers to create a specification, and reads nothing before", async () => {
    const view = await render();
    expect(view.find("button.creer").text()).toContain("Créer un référentiel");
    expect(view.find('input[name="depotACreer"]').exists()).toBe(false);
    expect(checked).toEqual([]);
  });

  it("explains what a specification is, and how to create its repo empty", async () => {
    const view = await render();
    await view.find("button.creer").trigger("click");
    expect(view.text()).toContain("dépôt à part du code");
    expect(view.text()).toContain("sans README");
    const link = view.find('a[href^="https://github.com/new"]');
    expect(link.exists()).toBe(true);
    await view.find('input[name="depotACreer"]').setValue("org/atlas-cadrage");
    expect(
      view.find('a[href^="https://github.com/new"]').attributes("href"),
    ).toBe("https://github.com/new?owner=org&name=atlas-cadrage");
  });

  it("opens the repo once it is ready, where the assistant goes on", async () => {
    const view = await render();
    await submit(view, "org/atlas-cadrage");
    expect(checked).toEqual([{ owner: "org", repo: "atlas-cadrage" }]);
    await vi.waitFor(() =>
      expect(router.currentRoute.value.fullPath).toBe(
        "/org/atlas-cadrage/referentiel",
      ),
    );
  });

  it("refuses a malformed repo without asking the platform", async () => {
    const view = await render();
    await submit(view, "atlas");
    expect(checked).toEqual([]);
    expect(view.text()).toContain("organisation/depot");
  });

  const causes: Array<[TargetCheck, string]> = [
    ["notFound", "introuvable"],
    ["notEmpty", "n’est pas vide"],
    ["cannotWrite", "Contents"],
    ["signInRequired", "connexion"],
  ];
  for (const [cause, text] of causes) {
    it(`names the cause when the repo is ${cause}, and stays`, async () => {
      answer = async () => cause;
      const view = await render();
      await submit(view, "org/atlas-cadrage");
      expect(view.find(".echec").text()).toContain(text);
      expect(router.currentRoute.value.fullPath).toBe("/");
    });
  }

  it("relays any other failure as the platform phrased it", async () => {
    answer = async () => {
      throw new GithubError("Quota épuisé.", 403, true);
    };
    const view = await render();
    await submit(view, "org/atlas-cadrage");
    expect(view.find(".echec").text()).toContain("Quota épuisé.");
  });

  describe("in English", () => {
    beforeEach(() => inject(LocaleService).choice.set("en"));

    it("speaks English", async () => {
      answer = async () => "notEmpty";
      const view = await render();
      expect(view.find("button.creer").text()).toContain(
        "Create a specification",
      );
      await submit(view, "org/atlas-cadrage");
      expect(view.find(".echec").text()).toContain("is not empty");
    });
  });
});
