import {
  HttpTestingController,
  provideHttpTesting,
} from "../http/http-testing";
import { inject, resetInjection } from "../injection";
import { beforeEach, describe, expect, it } from "vitest";
import { RepoLoader } from "./repo-loader";

/**
 * Reading what a specification cites from another — RG-regle-du-socle-citee.
 *
 * The citing project declares, in `ssk-canon.yml`, which repo each prefix
 * designates; a rule or an architecture decision declares, in `applique`, the
 * targets it applies and the cited scoping it took into account.
 */
describe("loading citations", () => {
  let httpMock: HttpTestingController;

  beforeEach(() => {
    resetInjection();
    httpMock = provideHttpTesting();
  });

  const tick = () => new Promise((r) => setTimeout(r, 0));

  async function load(
    config: string,
    files: readonly { path: string; content: string }[] = [],
  ) {
    const expected = inject(RepoLoader).loadSpecification({
      owner: "org",
      repo: "appli",
      ref: "main",
    });
    httpMock
      .expectOne(
        "https://api.github.com/repos/org/appli/git/trees/main?recursive=1",
      )
      .flush({
        sha: "c0mm17",
        truncated: false,
        tree: [{ path: "ssk-canon.yml" }, ...files].map((f, i) => ({
          path: f.path,
          sha: `b10b${i}`,
          type: "blob",
        })),
      });
    await tick();
    httpMock
      .expectOne(
        "https://raw.githubusercontent.com/org/appli/c0mm17/ssk-canon.yml",
      )
      .flush(config);
    await tick();
    for (const f of files) {
      httpMock
        .expectOne(
          `https://raw.githubusercontent.com/org/appli/c0mm17/${f.path}`,
        )
        .flush(f.content);
    }
    return expected;
  }

  const CITING =
    "schema_version: 1\nprojet:\n  nom: Appli\nreferentiels_cites:\n  - { prefixe: socle, repo: org/socle-cadrage }\n";

  it("reads the specifications the project cites", async () => {
    const specification = await load(CITING);

    expect(specification.project.citedRepos).toEqual([
      { prefix: "socle", repo: { owner: "org", repo: "socle-cadrage" } },
    ]);
  });

  it("cites nothing when the project declares nothing", async () => {
    // The case of every existing project: nothing must change for them.
    const specification = await load("schema_version: 1\nprojet:\n  nom: A\n");

    expect(specification.project.citedRepos).toEqual([]);
  });

  it("sets aside a faulty entry, and reports it", async () => {
    const specification = await load(
      "schema_version: 1\nprojet:\n  nom: A\nreferentiels_cites:\n  - { prefixe: socle }\n",
    );

    expect(specification.project.citedRepos).toEqual([]);
    expect(specification.anomalies.join("\n")).toContain("referentiels_cites");
  });

  it("reads what a rule applies", async () => {
    const specification = await load(CITING, [
      {
        path: "rules/RG-acces.md",
        content:
          "---\nid: RG-acces\nstatut: actif\nfonctionnalites: [f]\napplique:\n  - socle:RG-nommage-des-roles@2026-012\n---\n\nTexte.\n",
      },
    ]);

    expect(specification.rules.get("RG-acces")?.applies).toEqual([
      {
        prefix: "socle",
        target: "RG-nommage-des-roles",
        scoping: "2026-012",
      },
    ]);
  });

  it("reads what an architecture decision applies", async () => {
    const specification = await load(CITING, [
      {
        path: "decisions/ADR-runners.md",
        content:
          "---\nid: ADR-runners\nstatut: actif\napplique: [socle:ADR-runners-designes@2026-004]\n---\n\nTexte.\n",
      },
    ]);

    expect(specification.decisions.get("ADR-runners")?.applies).toEqual([
      {
        prefix: "socle",
        target: "ADR-runners-designes",
        scoping: "2026-004",
      },
    ]);
  });

  it("applies nothing when the rule cites nothing", async () => {
    const specification = await load(CITING, [
      {
        path: "rules/RG-seule.md",
        content: "---\nid: RG-seule\nstatut: actif\n---\n\nTexte.\n",
      },
    ]);

    expect(specification.rules.get("RG-seule")?.applies).toEqual([]);
  });
});
