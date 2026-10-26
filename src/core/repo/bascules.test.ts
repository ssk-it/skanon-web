import { provideHttpTesting } from "../http/http-testing";
import { inject, provide, resetInjection } from "../injection";
import { describe, expect, it } from "vitest";
import { GithubClient } from "../github/github-client";
import { ReferentielStore } from "./referentiel.store";
import { RepoConfig } from "./repo-config";
import { RedactionService, listBascules } from "./redaction.service";

/**
 * Les bascules de statut — RG-bascule-de-statut, cadrage 2026-045.
 *
 * Le statut se lit sur la demande de fusion : en brouillon, le cadrage l'est.
 * L'application ne le déplace qu'entre brouillon et en relecture, sans réglage,
 * et un cadrage naît toujours en brouillon.
 */

describe("Les bascules de statut", () => {
  it("ne mènent qu’entre brouillon et en relecture", () => {
    expect(listBascules("brouillon", true)).toEqual(["en_relecture"]);
    expect(listBascules("en_relecture", true)).toEqual(["brouillon"]);
  });

  it("ne proposent jamais « validée » : c’est une relecture qui l’accorde", () => {
    for (const depuis of ["brouillon", "en_relecture", "validee"] as const) {
      expect(listBascules(depuis, true)).not.toContain("validee");
    }
  });

  it("laissent reprendre un cadrage validé", () => {
    expect(listBascules("validee", true)).toEqual(["brouillon"]);
  });

  it("ne proposent jamais « livrée », et ne déplacent pas un cadrage livré", () => {
    expect(listBascules("livree", true)).toEqual([]);
    for (const depuis of ["brouillon", "en_relecture", "validee"] as const) {
      expect(listBascules(depuis, true)).not.toContain("livree");
    }
  });

  it("ne déplacent pas un cadrage hors de sa branche", () => {
    expect(listBascules("brouillon", false)).toEqual([]);
    expect(listBascules("en_relecture", false)).toEqual([]);
  });
});

describe("Un cadrage qui naît", () => {
  it("ouvre sa demande de fusion en brouillon", async () => {
    let brouillon: boolean | undefined;
    resetInjection();
    provide(GithubClient, {
      loadDepot: async () => ({ defaultBranch: "main", description: null }),
      shaDeBranche: async () => "abc",
      createBranche: async () => undefined,
      commitFichier: async () => undefined,
      createPullRequest: async (...args: unknown[]) => {
        brouillon = args[5] as boolean;
        return 7;
      },
    });
    inject(RepoConfig).saveDepot({ owner: "org", repo: "depot" });

    const cree = await inject(RedactionService).createCadrage({
      titre: "Un nouveau cadrage",
      domaines: [],
      objectif: "Un objectif.",
      parcours: "",
    });

    expect(cree.pullRequest).toBe(7);
    expect(brouillon).toBe(true);
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
    const store = inject(ReferentielStore);
    const chargement = store.loadReferentiel({ owner: "org", repo: "depot" });
    http
      .expectOne((r) => r.url.includes("/git/trees/"))
      .flush({
        sha: "racine",
        truncated: false,
        tree: [{ path: "ssk-canon.yml", sha: "c1", type: "blob" }],
      });
    for (let tour = 0; tour < 50; tour++) {
      await Promise.resolve();
      const enVol = http.match((r) => r.url.endsWith("ssk-canon.yml"));
      if (enVol.length) {
        enVol[0].flush(config);
        break;
      }
    }
    await chargement;

    expect(store.etat()).toBe("pret");
    expect(store.referentiel().projet.nom).toBe("Essai");
    expect(store.referentiel().anomalies).toEqual([]);
  });
});
