import { flushPromises, mount } from "@vue/test-utils";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { createMemoryHistory } from "vue-router";
import { provideHttpTesting } from "../../core/http/http-testing";
import { inject } from "../../core/injection";
import {
  DEFAULT_LINK_TAGS,
  type AccessMode,
  type TokenProtection,
  type Specification,
} from "../../core/model/model";
import { SpecificationStore } from "../../core/repo/specification.store";
import { SettingsService } from "../../core/repo/settings.service";
import { RepoConfig } from "../../core/repo/repo-config";
import { createAppRouter } from "../../router";
import SettingsPage from "./SettingsPage.vue";

function specification(
  tokenProtection: TokenProtection,
  access: AccessMode = "jeton_personnel",
): Specification {
  return {
    project: { name: "Test", description: "", codeRepos: [], prefix: null },
    settings: {
      access,
      identity:
        access === "identite_tierce"
          ? { issuer: "https://e", client: "c", exchange: "https://x" }
          : null,
      tokenProtection,
      linkTags: DEFAULT_LINK_TAGS,
    },
    domains: new Map(),
    features: new Map(),
    rules: new Map(),
    decisions: new Map(),
    architecture: new Map(),
    scopings: new Map(),
    anomalies: [],
  };
}

async function mountView(
  protection: TokenProtection = "proposee",
  access: AccessMode = "jeton_personnel",
) {
  const store = inject(SpecificationStore);
  store.specification.set(specification(protection, access));
  store.state.set("pret");
  const router = createAppRouter(createMemoryHistory());
  await router.push("/org/depot/reglages");
  await router.isReady();
  const view = mount(SettingsPage, { global: { plugins: [router] } });
  await flushPromises();
  return view;
}

/**
 * The token protection setting, and the description of each way of keeping it — RG-protection-du-jeton-par-projet, RG-garanties-annoncees.
 */
describe("Settings: token protection", () => {
  beforeEach(() => {
    provideHttpTesting();
    inject(RepoConfig).saveRepo({ owner: "org", repo: "depot" });
  });

  const section = (view: Awaited<ReturnType<typeof mountView>>) =>
    view.find(".protection-du-jeton");

  const choice = (view: Awaited<ReturnType<typeof mountView>>, value: string) =>
    section(view).find(`input[type=radio][value=${value}]`);

  it("offers the passkey by default, without requiring it", async () => {
    const view = await mountView();
    expect((choice(view, "proposee").element as HTMLInputElement).checked).toBe(
      true,
    );
    expect((choice(view, "exigee").element as HTMLInputElement).checked).toBe(
      false,
    );
  });

  it("shows the requirement the project declares", async () => {
    const view = await mountView("exigee");
    expect((choice(view, "exigee").element as HTMLInputElement).checked).toBe(
      true,
    );
  });

  it("describes each way of keeping the token, what it protects and what it leaves exposed", async () => {
    const text = section(await mountView()).text();
    expect(text).toContain("En clair, dans le navigateur");
    expect(text).toContain("Sous passkey, dans le navigateur");
    expect(text).toContain("Dans le coffre du système");
    expect(text).toContain("Pour la session seulement");
    // what does not change, whatever the form
    expect(text).toContain("script");
    expect(text).toContain("révocation");
  });

  it("says the requirement is the application's, not GitHub's", async () => {
    const text = section(await mountView()).text();
    expect(text).toContain("non de GitHub");
    expect(text).toContain("durée de vie");
  });

  it("offers the requirement through a pull request", async () => {
    const proposed = vi
      .spyOn(inject(SettingsService), "proposeSettings")
      .mockResolvedValue({
        branch: "reglages",
        pullRequest: 7,
        url: "https://github.com/org/depot/pull/7",
      });
    const view = await mountView();
    await choice(view, "exigee").setValue(true);
    await view
      .findAll("button")
      .find((b) => b.text() === "Proposer ces réglages")!
      .trigger("click");
    await flushPromises();
    expect(proposed).toHaveBeenCalledWith(
      expect.objectContaining({ tokenProtection: "exigee" }),
    );
  });

  it("does not show under a third-party identity, whose access lasts only the session", async () => {
    const view = await mountView("proposee", "identite_tierce");
    expect(section(view).exists()).toBe(false);
  });
});
