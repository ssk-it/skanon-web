import {
  HttpTestingController,
  provideHttpTesting,
} from "../http/http-testing";
import { inject } from "../injection";
import { beforeEach, describe, expect, it } from "vitest";
import { createMemoryHistory, type Router } from "vue-router";
import { createAppRouter } from "../../routeur";
import { LinksService } from "./liens.service";
import { RepoConfig } from "./repo-config";
import { SpecificationStore } from "./referentiel.store";

describe("Adressage par dépôt", () => {
  let httpMock: HttpTestingController;
  let router: Router;

  // Le banc d'essai ne fournit qu'un `localStorage` incomplet, sans `clear` ni
  // `removeItem`. On en substitue un vrai : ce qui est éprouvé ici est
  // l'adressage, pas la capacité du navigateur à stocker.
  let storage: Record<string, string>;

  beforeEach(() => {
    storage = {};
    Object.defineProperty(globalThis, "localStorage", {
      configurable: true,
      value: {
        getItem: (c: string) => storage[c] ?? null,
        setItem: (c: string, v: string) => void (storage[c] = v),
        removeItem: (c: string) => void delete storage[c],
        clear: () => void (storage = {}),
      },
    });
    httpMock = provideHttpTesting();
    router = createAppRouter(createMemoryHistory());
  });

  it("ouvre le dépôt que porte l’adresse", async () => {
    await router.push("/wayne-corp/wayne-devis-cadrage/referentiel");

    expect(inject(RepoConfig).repoRef()).toEqual({
      owner: "wayne-corp",
      repo: "wayne-devis-cadrage",
    });
    const query = httpMock.expectOne((r) => r.url.includes("/git/trees/"));
    expect(query.request.url).toContain("wayne-corp/wayne-devis-cadrage");
  });

  it("ne recharge pas en naviguant à l’intérieur du même dépôt", async () => {
    await router.push("/ssk-it/ssk-canon/referentiel");
    httpMock
      .expectOne((r) => r.url.includes("/git/trees/"))
      .flush({ sha: "abc", truncated: false, tree: [] });
    await inject(SpecificationStore).waitReady();

    await router.push("/ssk-it/ssk-canon/referentiel");

    // Cinquante-huit lectures à chaque changement de vue seraient payées par le
    // quota : le dépôt n'a pas changé, il n'y a rien à relire.
    httpMock.expectNone((r) => r.url.includes("/git/trees/"));
  });

  it("préfixe les liens internes par le dépôt ouvert", () => {
    inject(RepoConfig).saveRepo({ owner: "ssk-it", repo: "ssk-canon" });

    expect(inject(LinksService).to("referentiel", "regle", "RG-x")).toEqual([
      "/",
      "ssk-it",
      "ssk-canon",
      "referentiel",
      "regle",
      "RG-x",
    ]);
  });
});
