import { flushPromises, mount } from "@vue/test-utils";
import { beforeEach, describe, expect, it } from "vitest";
import { provideHttpTesting } from "../../core/http/http-testing";
import { LocaleService } from "../../core/i18n/locale.service";
import { inject } from "../../core/injection";
import RepoDialog from "./RepoDialog.vue";

/**
 * The choice of the repo to open, in the displayed language (RG-textes-traduits).
 */
describe("RepoDialog", () => {
  beforeEach(() => {
    provideHttpTesting();
  });

  it("speaks French by default", async () => {
    const view = mount(RepoDialog);
    await flushPromises();
    expect(view.text()).toContain("Ouvrir un dépôt de projet");
    expect(view.text()).toContain("Ou saisir un dépôt");
  });

  describe("in English", () => {
    beforeEach(() => inject(LocaleService).choice.set("en"));

    it("speaks English, not French", async () => {
      const view = mount(RepoDialog);
      await flushPromises();
      const text = view.text();
      for (const english of [
        "Open a project repo",
        "Or enter a repo",
        "A short name, or a full GitHub URL",
        "Cancel",
      ])
        expect(text).toContain(english);
      for (const french of ["Ouvrir un dépôt", "Annuler", "Ou saisir"])
        expect(text).not.toContain(french);
    });
  });
});
