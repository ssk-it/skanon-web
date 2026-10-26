import { provideHttpTesting } from "../http/http-testing";
import { inject, provide, resetInjection } from "../injection";
import { describe, expect, it } from "vitest";
import { GithubClient } from "../github/github-client";
import { SpecificationStore } from "./specification.store";
import { RepoConfig } from "./repo-config";
import { AuthoringService, listToggles } from "./authoring.service";

/**
 * Les bascules de statut — RG-bascule-de-statut, cadrage 2026-045.
 *
 * Le statut se lit sur la demande de fusion : en brouillon, le cadrage l'est.
 * L'application ne le déplace qu'entre brouillon et en relecture, sans réglage,
 * et un cadrage naît toujours en brouillon.
 */

describe("Les bascules de statut", () => {
  it("ne mènent qu’entre brouillon et en relecture", () => {
    expect(listToggles("brouillon", true)).toEqual(["en_relecture"]);
    expect(listToggles("en_relecture", true)).toEqual(["brouillon"]);
  });

  it("ne proposent jamais « validée » : c’est une relecture qui l’accorde", () => {
    for (const from of ["brouillon", "en_relecture", "validee"] as const) {
      expect(listToggles(from, true)).not.toContain("validee");
    }
  });

  it("laissent reprendre un cadrage validé", () => {
    expect(listToggles("validee", true)).toEqual(["brouillon"]);
  });

  it("ne proposent jamais « livrée », et ne déplacent pas un cadrage livré", () => {
    expect(listToggles("livree", true)).toEqual([]);
    for (const from of ["brouillon", "en_relecture", "validee"] as const) {
      expect(listToggles(from, true)).not.toContain("livree");
    }
  });

  it("ne déplacent pas un cadrage hors de sa branche", () => {
    expect(listToggles("brouillon", false)).toEqual([]);
    expect(listToggles("en_relecture", false)).toEqual([]);
  });
});

describe("Un cadrage qui naît", () => {
  it("ouvre sa demande de fusion en brouillon", async () => {
    let draft: boolean | undefined;
    resetInjection();
    provide(GithubClient, {
      loadRepo: async () => ({ defaultBranch: "main", description: null }),
      branchSha: async () => "abc",
      createBranch: async () => undefined,
      commitFile: async () => undefined,
      createPullRequest: async (...args: unknown[]) => {
        draft = args[5] as boolean;
        return 7;
      },
    });
    inject(RepoConfig).saveRepo({ owner: "org", repo: "depot" });

    const cree = await inject(AuthoringService).createScoping({
      title: "Un nouveau cadrage",
      domains: [],
      goal: "Un objectif.",
      journey: "",
    });

    expect(cree.pullRequest).toBe(7);
    expect(draft).toBe(true);
  });
});

describe("Un projet qui déclare encore les réglages retirés", () => {
  it("se lit sans anomalie : les clés sont ignorées", async () => {
    resetInjection();

    const config = `schema_version: 1
projet:
  nom: Essai
transitions:
  brouillon: [en_relecture]
  en_relecture: [brouillon, validee]
reflet_demande_fusion: true
`;
    const http = provideHttpTesting();
    const store = inject(SpecificationStore);
    const loading = store.loadSpecification({ owner: "org", repo: "depot" });
    http
      .expectOne((r) => r.url.includes("/git/trees/"))
      .flush({
        sha: "racine",
        truncated: false,
        tree: [{ path: "ssk-canon.yml", sha: "c1", type: "blob" }],
      });
    for (let round = 0; round < 50; round++) {
      await Promise.resolve();
      const inFlight = http.match((r) => r.url.endsWith("ssk-canon.yml"));
      if (inFlight.length) {
        inFlight[0].flush(config);
        break;
      }
    }
    await loading;

    expect(store.state()).toBe("pret");
    expect(store.specification().project.name).toBe("Essai");
    expect(store.specification().anomalies).toEqual([]);
  });
});
