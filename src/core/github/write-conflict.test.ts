import {
  HttpTestingController,
  provideHttpTesting,
} from "../http/http-testing";
import { inject, resetInjection } from "../injection";
import { beforeEach, describe, expect, it } from "vitest";
import { GithubClient, GithubError } from "./github-client";

/**
 * RG-message-nomme-la-cause et RG-reprise-cadrage : GitHub répond 409 à deux
 * situations sans rapport — lire un dépôt sans aucun enregistrement, et écrire
 * sur une version qui n'est plus la dernière. Les confondre enverrait déposer
 * un README dans un dépôt qui en a déjà un, au lieu de recharger le cadrage.
 */
describe("le 409 de GitHub", () => {
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

  it("dit le dépôt vide à la lecture", async () => {
    const read = client.loadTree(REPO).catch((e: unknown) => e);
    await waitFor();
    http
      .expectOne(`${API}/git/trees/HEAD?recursive=1`)
      .error({ message: "Git Repository is empty." }, { status: 409 });

    const error = (await read) as GithubError;
    expect(error).toBeInstanceOf(GithubError);
    expect(error.message).toContain("Ce dépôt est vide");
  });

  it("dit le conflit d’écriture quand la version lue n’est plus la dernière", async () => {
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
});
