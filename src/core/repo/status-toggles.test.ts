import { provideHttpTesting } from "../http/http-testing";
import { inject, provide, resetInjection } from "../injection";
import { describe, expect, it } from "vitest";
import { GithubClient } from "../github/github-client";
import { SpecificationStore } from "./specification.store";
import { RepoConfig } from "./repo-config";
import { AuthoringService, listToggles } from "./authoring.service";
import { LocaleService } from "../i18n/locale.service";

/**
 * Status toggles — RG-bascule-de-statut, scoping 2026-045.
 *
 * The status is read on the pull request: as a draft, the scoping is one.
 * The application moves it only between draft and in review, without a
 * setting, and a scoping is always born as a draft.
 */

describe("Status toggles", () => {
  it("only lead between draft and in review", () => {
    expect(listToggles("brouillon", true)).toEqual(["en_relecture"]);
    expect(listToggles("en_relecture", true)).toEqual(["brouillon"]);
  });

  it("never offer « validée »: it is a review that grants it", () => {
    for (const from of ["brouillon", "en_relecture", "validee"] as const) {
      expect(listToggles(from, true)).not.toContain("validee");
    }
  });

  it("let an approved scoping be taken back", () => {
    expect(listToggles("validee", true)).toEqual(["brouillon"]);
  });

  it("never offer « livrée », and do not move a delivered scoping", () => {
    expect(listToggles("livree", true)).toEqual([]);
    for (const from of ["brouillon", "en_relecture", "validee"] as const) {
      expect(listToggles(from, true)).not.toContain("livree");
    }
  });

  it("do not move a scoping off its branch", () => {
    expect(listToggles("brouillon", false)).toEqual([]);
    expect(listToggles("en_relecture", false)).toEqual([]);
  });
});

describe("A scoping being born", () => {
  it("opens its pull request as a draft", async () => {
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

describe("A project that still declares the removed settings", () => {
  it("is read without anomaly: the keys are ignored", async () => {
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

describe("A status the application cannot request, in English", () => {
  it("is refused with the English label of the status", async () => {
    resetInjection();
    inject(LocaleService).choice.set("en");

    await expect(
      inject(AuthoringService).changeStatus("2026-001", "validee"),
    ).rejects.toThrow(
      "“Approved” cannot be requested from the application: this status comes from the review on the platform.",
    );
  });
});
