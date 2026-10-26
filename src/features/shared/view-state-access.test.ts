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
 * RG-message-nomme-la-cause : un dépôt introuvable sous un jeton personnel l'est presque toujours parce que le jeton ne le couvre pas. Le message seul dit quoi vérifier ; l'aide dit où, et comment.
 */
describe("dépôt introuvable sous un jeton", () => {
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

  // Sous un jeton, la requête part après la lecture du dernier état connu, qui est asynchrone.
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

  it("renvoie vers la gestion des jetons, en nommant le dépôt à y ajouter", async () => {
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

  it("dirige un jeton classique vers ses propres réglages : il n’a pas de sélection de dépôts", async () => {
    tokens.set("ghp_jetonDeTestSuffisammentLong");
    await loadNotFound();

    const view = render();
    expect(
      view.querySelector('a[href="https://github.com/settings/tokens"]'),
    ).not.toBeNull();
    expect(view.textContent).not.toContain("Repository access");
  });

  it("n’en parle pas sans jeton : il n’y en a aucun à corriger", async () => {
    await loadNotFound();

    expect(
      render().querySelector('a[href*="personal-access-tokens"]'),
    ).toBeNull();
  });

  it("n’en parle pas sous un accès temporaire : il ne se règle pas dans ses jetons", async () => {
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

  it("n’en parle pas pour un autre échec", async () => {
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
