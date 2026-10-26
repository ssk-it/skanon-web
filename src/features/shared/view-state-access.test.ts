import { mount } from "@vue/test-utils";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { TokenService } from "../../core/github/token.service";
import {
  provideHttpTesting,
  type HttpTestingController,
} from "../../core/http/http-testing";
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

  it("does not mention it without a token: there is none to correct", async () => {
    await loadNotFound();

    expect(
      render().querySelector('a[href*="personal-access-tokens"]'),
    ).toBeNull();
  });

  it("does not mention it under temporary access: it is not set in one's tokens", async () => {
    tokens.setAccess({
      token: "ghs_accesTemporaire",
      validUntil: new Date(Date.now() + 3_600_000).toISOString(),
      repos: [],
      identity: { identifier: "u", name: "U", email: null },
    });
    await loadNotFound();

    expect(
      render().querySelector('a[href*="personal-access-tokens"]'),
    ).toBeNull();
    tokens.eraseAccess();
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
});
