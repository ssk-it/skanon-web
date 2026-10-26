import {
  HttpTestingController,
  provideHttpTesting,
} from "../http/http-testing";
import { inject } from "../injection";
import { beforeEach, describe, expect, it } from "vitest";
import { createMemoryHistory, type Router } from "vue-router";
import { createAppRouter } from "../../router";
import { LinksService } from "./links.service";
import { RepoConfig } from "./repo-config";
import { SpecificationStore } from "./specification.store";

describe("Addressing by repo", () => {
  let httpMock: HttpTestingController;
  let router: Router;

  // The test bench provides only an incomplete `localStorage`, without `clear`
  // or `removeItem`. A real one is substituted: what is tested here is
  // addressing, not the browser's ability to store.
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

  it("opens the repo the address carries", async () => {
    await router.push("/wayne-corp/wayne-devis-cadrage/referentiel");

    expect(inject(RepoConfig).repoRef()).toEqual({
      owner: "wayne-corp",
      repo: "wayne-devis-cadrage",
    });
    const query = httpMock.expectOne((r) => r.url.includes("/git/trees/"));
    expect(query.request.url).toContain("wayne-corp/wayne-devis-cadrage");
  });

  it("does not reload when navigating within the same repo", async () => {
    await router.push("/ssk-it/ssk-canon/referentiel");
    httpMock
      .expectOne((r) => r.url.includes("/git/trees/"))
      .flush({ sha: "abc", truncated: false, tree: [] });
    await inject(SpecificationStore).waitReady();

    await router.push("/ssk-it/ssk-canon/referentiel");

    // Fifty-eight reads on every view change would be paid for by the quota:
    // the repo has not changed, there is nothing to read again.
    httpMock.expectNone((r) => r.url.includes("/git/trees/"));
  });

  it("prefixes internal links with the open repo", () => {
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
