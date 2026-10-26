import { mount } from "@vue/test-utils";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { TokenService } from "../../core/github/token.service";
import {
  provideHttpTesting,
  type HttpTestingController,
} from "../../core/http/http-testing";
import { inject } from "../../core/injection";
import { ReferentielStore } from "../../core/repo/referentiel.store";
import EtatVue from "./EtatVue.vue";

/**
 * RG-message-nomme-la-cause : un dépôt introuvable sous un jeton personnel l'est presque toujours parce que le jeton ne le couvre pas. Le message seul dit quoi vérifier ; l'aide dit où, et comment.
 */
describe("dépôt introuvable sous un jeton", () => {
  const DEPOT = { owner: "ssk-it", repo: "prive" };
  let httpMock: HttpTestingController;
  let store: ReferentielStore;
  let tokens: TokenService;

  beforeEach(() => {
    httpMock = provideHttpTesting();
    store = inject(ReferentielStore);
    tokens = inject(TokenService);
  });

  afterEach(() => tokens.effacer());

  // Sous un jeton, la requête part après la lecture du dernier état connu, qui est asynchrone.
  async function attendre(): Promise<void> {
    for (let i = 0; i < 20; i++) await new Promise((r) => setTimeout(r, 0));
  }

  async function chargerIntrouvable(): Promise<void> {
    const attente = store.loadReferentiel(DEPOT);
    await attendre();
    httpMock
      .expectOne((r) => r.url.includes("/git/trees/"))
      .flush("Not Found", { status: 404, statusText: "Not Found" });
    await attente;
  }

  function rendre(): HTMLElement {
    return mount(EtatVue).element as HTMLElement;
  }

  it("renvoie vers la gestion des jetons, en nommant le dépôt à y ajouter", async () => {
    tokens.definir("github_pat_jetonDeTestSuffisammentLong");
    await chargerIntrouvable();

    const vue = rendre();
    const lien = vue.querySelector<HTMLAnchorElement>(
      'a[href="https://github.com/settings/personal-access-tokens"]',
    );
    expect(lien).not.toBeNull();
    expect(lien?.target).toBe("_blank");
    expect(vue.textContent).toContain("Repository access");
    expect(vue.textContent).toContain("ssk-it/prive");
  });

  it("dirige un jeton classique vers ses propres réglages : il n’a pas de sélection de dépôts", async () => {
    tokens.definir("ghp_jetonDeTestSuffisammentLong");
    await chargerIntrouvable();

    const vue = rendre();
    expect(
      vue.querySelector('a[href="https://github.com/settings/tokens"]'),
    ).not.toBeNull();
    expect(vue.textContent).not.toContain("Repository access");
  });

  it("n’en parle pas sans jeton : il n’y en a aucun à corriger", async () => {
    await chargerIntrouvable();

    expect(
      rendre().querySelector('a[href*="personal-access-tokens"]'),
    ).toBeNull();
  });

  it("n’en parle pas sous un accès temporaire : il ne se règle pas dans ses jetons", async () => {
    tokens.definirAcces({
      jeton: "ghs_accesTemporaire",
      valideJusqua: new Date(Date.now() + 3_600_000).toISOString(),
      depots: [],
      identite: { identifiant: "u", nom: "U", courriel: null },
    });
    await chargerIntrouvable();

    expect(
      rendre().querySelector('a[href*="personal-access-tokens"]'),
    ).toBeNull();
    tokens.effacerAcces();
  });

  it("n’en parle pas pour un autre échec", async () => {
    tokens.definir("github_pat_jetonDeTestSuffisammentLong");
    const attente = store.loadReferentiel(DEPOT);
    await attendre();
    httpMock
      .expectOne((r) => r.url.includes("/git/trees/"))
      .flush("Boom", { status: 500, statusText: "Server Error" });
    await attente;

    expect(
      rendre().querySelector('a[href*="personal-access-tokens"]'),
    ).toBeNull();
  });
});
