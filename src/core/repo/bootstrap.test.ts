import { inject, provide, resetInjection } from "../injection";
import { beforeEach, describe, expect, it } from "vitest";
import { load } from "js-yaml";
import { GithubClient, GithubError } from "../github/github-client";
import { RepoConfig } from "./repo-config";
import { SpecificationStore } from "./specification.store";
import {
  BootstrapService,
  proposedNames,
  type NewProject,
} from "./bootstrap.service";
import { resolveNames } from "./repo-names";

/**
 * Bootstrapping an empty repo — RG-amorcage-depot, RG-rien-inventer,
 * RG-textes-traduits (scoping 2026-062).
 */
describe("Bootstrapping a repo", () => {
  let commits: { files: { path: string; content: string }[]; branch: string }[];

  beforeEach(() => {
    commits = [];
    resetInjection();
    provide(GithubClient, {
      loadRepo: async () => ({
        defaultBranch: "trunk",
        description: null,
        canWrite: true,
      }),
      commitInitialTree: async (
        _repo: unknown,
        branch: string,
        files: { path: string; content: string }[],
      ) => {
        commits.push({ branch, files: [...files] });
        return "c";
      },
    });
    provide(SpecificationStore, {
      repoRef: () => ({ owner: "org", repo: "depot" }),
      loadSpecification: async () => undefined,
    });
    inject(RepoConfig).saveRepo({ owner: "org", repo: "depot" });
  });

  const project = (over: Partial<NewProject> = {}): NewProject => ({
    name: "Essai",
    description: "",
    language: "fr",
    ...over,
  });

  async function bootstrap(p: NewProject) {
    await inject(BootstrapService).bootstrapProject(p);
    expect(commits).toHaveLength(1);
    return new Map(commits[0].files.map((f) => [f.path, f.content]));
  }

  it("writes the whole structure in one commit, on the default branch", async () => {
    await bootstrap(project());
    expect(commits[0].branch).toBe("trunk");
  });

  it("only writes to the configuration what is read", async () => {
    const config = (await bootstrap(project())).get("ssk-canon.yml") ?? "";
    expect(config).toContain("nom: Essai");
    expect(config).not.toMatch(/^statuts:/m);
    expect(config).not.toMatch(/^operations:/m);
  });

  it("writes no link kind nobody declared", async () => {
    const config = (await bootstrap(project())).get("ssk-canon.yml") ?? "";
    expect(config).not.toMatch(/^tags_liens:/m);
  });

  it("writes the link kinds and code repos that were declared", async () => {
    const config =
      (
        await bootstrap(
          project({
            linkTags: ["issue_github", "maquette"],
            codeRepos: [
              { repo: "org/front", role: "Application web" },
              { repo: "org/back", role: "" },
            ],
          }),
        )
      ).get("ssk-canon.yml") ?? "";
    const data = load(config) as Record<string, unknown>;
    expect(data["tags_liens"]).toEqual(["issue_github", "maquette"]);
    expect(data["depots_code"]).toEqual([
      { repo: "org/front", role: "Application web" },
      { repo: "org/back" },
    ]);
  });

  it("leaves a missing description missing", async () => {
    const config = (await bootstrap(project())).get("ssk-canon.yml") ?? "";
    const data = load(config) as { projet: Record<string, unknown> };
    expect(data.projet.description).toBeUndefined();
  });

  it("declares the folder names in the interface's language, in French", async () => {
    const files = await bootstrap(project());
    const config = files.get("ssk-canon.yml") ?? "";
    const { names, anomalies } = resolveNames(load(config));
    expect(anomalies).toEqual([]);
    expect(names).toEqual(proposedNames("fr"));
    expect(names.dossiers.regles).toBe("regles");
    expect(names.fichiers.pieces_jointes).toBe("pieces-jointes.md");
    expect([...files.keys()]).toEqual(
      expect.arrayContaining([
        "domaines/README.md",
        "fonctionnalites/README.md",
        "regles/README.md",
        "cadrages/README.md",
        "README.md",
      ]),
    );
    expect(files.get("regles/README.md")).toContain("# Règles de gestion");
  });

  it("writes an English repo in English", async () => {
    const files = await bootstrap(project({ language: "en" }));
    const config = files.get("ssk-canon.yml") ?? "";
    expect(resolveNames(load(config)).names).toEqual(proposedNames("en"));
    expect(files.get("scopings/README.md")).toContain("# Scopings");
    expect(files.get("rules/README.md")).toContain("# Business rules");
    expect(files.get("README.md")).toContain("specification of Essai");
    expect(config).toContain("# Project configuration");
    expect([...files.values()].join("\n")).not.toMatch(/Règles|référentiel/);
  });

  it("keeps the names that were chosen", async () => {
    const names = proposedNames("fr");
    const files = await bootstrap(
      project({
        names: { ...names, dossiers: { ...names.dossiers, regles: "rg" } },
      }),
    );
    expect(files.has("rg/README.md")).toBe(true);
    expect(files.get("rg/README.md")).toContain("`rg/`");
    const config = files.get("ssk-canon.yml") ?? "";
    expect(resolveNames(load(config)).names.dossiers.regles).toBe("rg");
  });

  it("lists the files it will write, before writing them", () => {
    const planned = inject(BootstrapService)
      .plannedFiles(project())
      .map((f) => f.path);
    expect(planned[0]).toBe("ssk-canon.yml");
    expect(planned).toContain("cadrages/README.md");
  });
});

describe("Checking the repo a specification will be created in", () => {
  const REPO = { owner: "org", repo: "depot" };

  function check(options: {
    repo?: () => Promise<{ canWrite: boolean | null }>;
    empty?: () => Promise<boolean>;
  }) {
    resetInjection();
    provide(GithubClient, {
      loadRepo:
        options.repo ??
        (async () => ({
          defaultBranch: "main",
          description: null,
          canWrite: true,
        })),
      isEmptyRepo: options.empty ?? (async () => true),
    });
    return inject(BootstrapService).checkTarget(REPO);
  }

  it("is ready when the repo exists, is empty and writable", async () => {
    expect(await check({})).toBe("ready");
  });

  it("names the repo it cannot find", async () => {
    expect(
      await check({
        repo: async () => {
          throw new GithubError("introuvable", 404);
        },
      }),
    ).toBe("notFound");
  });

  it("refuses a repo that already carries something", async () => {
    expect(await check({ empty: async () => false })).toBe("notEmpty");
  });

  it("names the missing right to write", async () => {
    expect(await check({ repo: async () => ({ canWrite: false }) })).toBe(
      "cannotWrite",
    );
  });

  it("asks to sign in when the platform says nothing of the right", async () => {
    expect(await check({ repo: async () => ({ canWrite: null }) })).toBe(
      "signInRequired",
    );
  });

  it("lets any other failure through", async () => {
    await expect(
      check({
        repo: async () => {
          throw new GithubError("quota", 403, true);
        },
      }),
    ).rejects.toBeInstanceOf(GithubError);
  });
});
