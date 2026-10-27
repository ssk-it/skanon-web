import { mount } from "@vue/test-utils";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { TokenService } from "../../core/github/token.service";
import {
  provideHttpTesting,
  type HttpTestingController,
} from "../../core/http/http-testing";
import { LocaleService } from "../../core/i18n/locale.service";
import { inject } from "../../core/injection";
import { SpecificationStore } from "../../core/repo/specification.store";
import ViewState from "./ViewState.vue";

/**
 * RG-message-nomme-la-cause: a repo not found under a personal token is almost always so because the token does not cover it. The message alone says what to check; the help says where, and how.
 */
describe("repo not found under a token", () => {
  const REPO = { owner: "ssk-it", repo: "prive" };
  let httpMock: HttpTestingController;
  let store: SpecificationStore;
  let tokens: TokenService;

  beforeEach(() => {
    httpMock = provideHttpTesting();
    store = inject(SpecificationStore);
    tokens = inject(TokenService);
  });

  afterEach(() => tokens.erase());

  // Under a token, the request goes out after reading the last known state, which is asynchronous.
  async function waitFor(): Promise<void> {
    for (let i = 0; i < 20; i++) await new Promise((r) => setTimeout(r, 0));
  }

  async function loadNotFound(): Promise<void> {
    const pending = store.loadSpecification(REPO);
    await waitFor();
    httpMock
      .expectOne((r) => r.url.includes("/git/trees/"))
      .flush("Not Found", { status: 404, statusText: "Not Found" });
    await pending;
  }

  function render(): HTMLElement {
    return mount(ViewState).element as HTMLElement;
  }

  it("points to token management, naming the repo to add there", async () => {
    tokens.set("github_pat_jetonDeTestSuffisammentLong");
    await loadNotFound();

    const view = render();
    const link = view.querySelector<HTMLAnchorElement>(
      'a[href="https://github.com/settings/personal-access-tokens"]',
    );
    expect(link).not.toBeNull();
    expect(link?.target).toBe("_blank");
    expect(view.textContent).toContain("Repository access");
    expect(view.textContent).toContain("ssk-it/prive");
  });

  it("directs a classic token to its own settings: it has no repo selection", async () => {
    tokens.set("ghp_jetonDeTestSuffisammentLong");
    await loadNotFound();

    const view = render();
    expect(
      view.querySelector('a[href="https://github.com/settings/tokens"]'),
    ).not.toBeNull();
    expect(view.textContent).not.toContain("Repository access");
  });

  // 2026-065: a private repo read before the tokens are opened is not « not found » — it waits for them.
  it("says the repo waits for the tokens to be unlocked, rather than not found", async () => {
    vi.spyOn(tokens, "locked").mockReturnValue(true);
    await loadNotFound();

    const view = render();
    expect(view.textContent).toContain("Vos jetons sont verrouillés");
    expect(view.textContent).not.toContain("introuvable");
    expect(view.querySelector('a[href*="personal-access-tokens"]')).toBeNull();
  });

  it("does not mention it without a token: there is none to correct", async () => {
    await loadNotFound();

    expect(
      render().querySelector('a[href*="personal-access-tokens"]'),
    ).toBeNull();
  });

  it("does not mention it for another failure", async () => {
    tokens.set("github_pat_jetonDeTestSuffisammentLong");
    const pending = store.loadSpecification(REPO);
    await waitFor();
    httpMock
      .expectOne((r) => r.url.includes("/git/trees/"))
      .flush("Boom", { status: 500, statusText: "Server Error" });
    await pending;

    expect(
      render().querySelector('a[href*="personal-access-tokens"]'),
    ).toBeNull();
  });

  describe("in English", () => {
    beforeEach(() => inject(LocaleService).choice.set("en"));

    it("says the repo could not be loaded, and how to give the token access", async () => {
      tokens.set("github_pat_jetonDeTestSuffisammentLong");
      await loadNotFound();

      const text = render().textContent ?? "";
      expect(text).toContain("The repo could not be loaded");
      expect(text).toContain("Give the token access to ssk-it/prive");
      expect(text).toContain("the access tokens page");
      expect(text).toContain("Try again");
      for (const french of ["n’a pas pu être chargé", "Réessayer", "Ouvrir"])
        expect(text).not.toContain(french);
    });

    it("guides a classic token in English", async () => {
      tokens.set("ghp_jetonDeTestSuffisammentLong");
      await loadNotFound();

      const text = render().textContent ?? "";
      expect(text).toContain("The saved token is a classic token");
      expect(text).toContain("Save another token");
    });
  });
});
