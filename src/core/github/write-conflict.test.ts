import {
  HttpTestingController,
  provideHttpTesting,
} from "../http/http-testing";
import { inject, resetInjection } from "../injection";
import { beforeEach, describe, expect, it } from "vitest";
import { GithubClient, GithubError } from "./github-client";
import { LocaleService } from "../i18n/locale.service";

/**
 * RG-message-nomme-la-cause and RG-reprise-cadrage: GitHub answers 409 to two
 * unrelated situations — reading a repo without any commit, and writing
 * on a version that is no longer the latest. Confusing them would send one to drop
 * a README in a repo that already has one, instead of reloading the scoping.
 */
describe("GitHub's 409", () => {
  const REPO = { owner: "org", repo: "projet" };
  const API = "https://api.github.com/repos/org/projet";

  let http: HttpTestingController;
  let client: GithubClient;

  beforeEach(() => {
    resetInjection();
    http = provideHttpTesting();
    client = inject(GithubClient);
  });

  async function waitFor(): Promise<void> {
    for (let i = 0; i < 10; i++) await new Promise((r) => setTimeout(r, 0));
  }

  it("reports the empty repo on read", async () => {
    const read = client.loadTree(REPO).catch((e: unknown) => e);
    await waitFor();
    http
      .expectOne(`${API}/git/trees/HEAD?recursive=1`)
      .error({ message: "Git Repository is empty." }, { status: 409 });

    const error = (await read) as GithubError;
    expect(error).toBeInstanceOf(GithubError);
    expect(error.message).toContain("Ce dépôt est vide");
  });

  it("reports the write conflict when the version read is no longer the latest", async () => {
    const writing = client
      .commitFile(
        REPO,
        "cadrage-2026-001",
        "cadrages/2026-001/cadrage.md",
        "contenu",
        "Modifier le cadrage",
        "ancien",
      )
      .catch((e: unknown) => e);
    await waitFor();
    http
      .expectOne(`${API}/contents/cadrages/2026-001/cadrage.md`)
      .error(
        { message: "cadrages/2026-001/cadrage.md does not match ancien" },
        { status: 409 },
      );

    const error = (await writing) as GithubError;
    expect(error).toBeInstanceOf(GithubError);
    expect(error.status).toBe(409);
    expect(error.message).not.toContain("vide");
    expect(error.message).toContain("modifié entre-temps");
  });

  describe("in English", () => {
    beforeEach(() => inject(LocaleService).choice.set("en"));

    it("reports the empty repo in English", async () => {
      const read = client.loadTree(REPO).catch((e: unknown) => e);
      await waitFor();
      http
        .expectOne(`${API}/git/trees/HEAD?recursive=1`)
        .error({ message: "Git Repository is empty." }, { status: 409 });

      const error = (await read) as GithubError;
      expect(error.status).toBe(409);
      expect(error.message).toContain("This repo is empty");
      expect(error.message).not.toContain("dépôt");
    });

    it("reports a repo not found in English, without a token", async () => {
      const read = client.loadTree(REPO).catch((e: unknown) => e);
      await waitFor();
      http
        .expectOne(`${API}/git/trees/HEAD?recursive=1`)
        .error({ message: "Not Found" }, { status: 404 });

      const error = (await read) as GithubError;
      expect(error.status).toBe(404);
      expect(error.message).toContain("Repo or file not found");
      expect(error.message).toContain("a private repo requires signing in");
    });

    it("reports the write conflict in English", async () => {
      const writing = client
        .commitFile(REPO, "b", "cadrages/2026-001/cadrage.md", "c", "m", "old")
        .catch((e: unknown) => e);
      await waitFor();
      http
        .expectOne(`${API}/contents/cadrages/2026-001/cadrage.md`)
        .error({ message: "does not match" }, { status: 409 });

      const error = (await writing) as GithubError;
      expect(error.message).toContain("modified in the meantime");
    });
  });
});
