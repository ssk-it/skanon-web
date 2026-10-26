import {
  HttpTestingController,
  provideHttpTesting,
} from "../http/http-testing";
import { inject, provide, resetInjection } from "../injection";
import { beforeEach, describe, expect, it } from "vitest";
import { IDBFactory } from "fake-indexeddb";
import { RepoLoader } from "./repo-loader";
import { INDEXEDDB_FACTORY } from "./contenus-cache";
import { GithubClient, GithubError } from "../github/github-client";
import { TokenService } from "../github/token.service";

/**
 * Chaque ouverture relisait tout : l'arborescence, puis chaque fichier, puis
 * chaque branche de cadrage, relue en entier. Sur un dépôt privé, chaque
 * fichier est un appel décompté — mesuré sur `ssk-canon`, environ huit cent
 * trente par ouverture. Voir le cadrage 2026-043.
 *
 * Chaque cas joue plusieurs visites sur le même stockage : `nouvelleVisite`
 * reconstruit l'application, sans la mémoire de l'onglet précédent.
 */
describe("cache des contenus au chargement", () => {
  const REPO = { owner: "org", repo: "projet" };
  const API = "https://api.github.com/repos/org/projet";
  const RAW = "https://raw.githubusercontent.com/org/projet";
  const RULE = (id: string) =>
    `---\nid: ${id}\nstatut: actif\n---\n\nUn énoncé.\n`;

  let factory: IDBFactory;
  let http: HttpTestingController;

  function newVisit(): RepoLoader {
    resetInjection();
    provide(INDEXEDDB_FACTORY, factory);
    http = provideHttpTesting();
    return inject(RepoLoader);
  }

  function tree(commit: string, files: Record<string, string>, ref = "HEAD") {
    http.expectOne(`${API}/git/trees/${ref}?recursive=1`).flush(
      {
        sha: commit,
        truncated: false,
        tree: Object.entries(files).map(([path, sha]) => ({
          path,
          sha,
          type: "blob",
        })),
      },
      { headers: { etag: `"${commit}"` } },
    );
  }

  /** Laisse tourner les files d'attente et le stockage avant la suite. */
  async function waitFor(): Promise<void> {
    for (let i = 0; i < 20; i++) await new Promise((r) => setTimeout(r, 0));
  }

  async function readAll(
    loader: RepoLoader,
    options = { remember: true, lastKnownState: true },
    ref?: string,
  ) {
    return loader.readSpecification(ref ? { ...REPO, ref } : REPO, options);
  }

  beforeEach(() => {
    factory = new IDBFactory();
  });

  it("ne redemande pas, à la visite suivante, un fichier que le poste détient", async () => {
    let loader = newVisit();
    let read = readAll(loader);
    tree("c1", { "rules/RG-a.md": "a1", "rules/RG-b.md": "b1" });
    await waitFor();
    http.expectOne(`${RAW}/c1/rules/RG-a.md`).flush(RULE("RG-a"));
    http.expectOne(`${RAW}/c1/rules/RG-b.md`).flush(RULE("RG-b"));
    await read;

    // Un commit plus tard, seule RG-b a changé.
    loader = newVisit();
    read = readAll(loader);
    tree("c2", { "rules/RG-a.md": "a1", "rules/RG-b.md": "b2" });
    await waitFor();
    http.expectOne(`${RAW}/c2/rules/RG-b.md`).flush(RULE("RG-b"));
    const result = await read;

    expect([...result.specification.rules.keys()].sort()).toEqual([
      "RG-a",
      "RG-b",
    ]);
    expect(result.unconfirmed).toBeNull();
    http.verify();
  });

  it("partage le cache entre la branche principale et une branche de cadrage", async () => {
    const loader = newVisit();
    const main = readAll(loader);
    tree("c1", { "rules/RG-a.md": "a1" });
    await waitFor();
    http.expectOne(`${RAW}/c1/rules/RG-a.md`).flush(RULE("RG-a"));
    await main;

    const branch = readAll(
      loader,
      { remember: true, lastKnownState: false },
      "cadrage-2026-001",
    );
    tree(
      "c9",
      { "rules/RG-a.md": "a1", "cadrages/2026-001/cadrage.md": "k1" },
      "cadrage-2026-001",
    );
    await waitFor();
    // Seul ce que la branche a en propre est demandé.
    http
      .expectOne(`${RAW}/c9/cadrages/2026-001/cadrage.md`)
      .flush("---\nid: 2026-001\ntitre: Un cadrage\n---\n");
    const result = await branch;

    expect(result.fingerprints).toEqual(new Set(["a1", "k1"]));
    http.verify();
  });

  it("demande l’arborescence sous condition quand l’utilisateur est connecté", async () => {
    let loader = newVisit();
    inject(TokenService).set("ghp_jetonDeTestSuffisammentLong");
    let read = readAll(loader);
    // Connecté, l'état connu est consulté avant que l'arborescence parte.
    await waitFor();
    tree("c1", { "rules/RG-a.md": "a1" });
    await waitFor();
    http.expectOne(`${RAW}/c1/rules/RG-a.md`).flush(RULE("RG-a"));
    await read;

    loader = newVisit();
    inject(TokenService).set("ghp_jetonDeTestSuffisammentLong");
    read = readAll(loader);
    await waitFor();
    const conditional = http.expectOne(`${API}/git/trees/HEAD?recursive=1`);
    expect(conditional.request.headers.get("If-None-Match")).toBe('"c1"');
    // Inchangée : la plateforme ne décompte rien, et rien d'autre n'est demandé.
    conditional.flush(null, { status: 304, statusText: "Not Modified" });
    const result = await read;

    expect(result.specification.rules.has("RG-a")).toBe(true);
    expect(result.unconfirmed).toBeNull();
    http.verify();
  });

  it("ne pose pas de condition sans connexion, où elle serait décomptée quand même", async () => {
    let loader = newVisit();
    let read = readAll(loader);
    tree("c1", { "rules/RG-a.md": "a1" });
    await waitFor();
    http.expectOne(`${RAW}/c1/rules/RG-a.md`).flush(RULE("RG-a"));
    await read;

    loader = newVisit();
    read = readAll(loader);
    await waitFor();
    const query = http.expectOne(`${API}/git/trees/HEAD?recursive=1`);
    expect(query.request.headers.has("If-None-Match")).toBe(false);
    query.flush({
      sha: "c1",
      truncated: false,
      tree: [{ path: "rules/RG-a.md", sha: "a1", type: "blob" }],
    });
    await read;
    http.verify();
  });

  it("montre le dernier état lu, daté et marqué, quand le dépôt ne répond pas", async () => {
    let loader = newVisit();
    let read = readAll(loader);
    tree("c1", { "rules/RG-a.md": "a1" });
    await waitFor();
    http.expectOne(`${RAW}/c1/rules/RG-a.md`).flush(RULE("RG-a"));
    await read;

    loader = newVisit();
    read = readAll(loader);
    await waitFor();
    http
      .expectOne(`${API}/git/trees/HEAD?recursive=1`)
      .error(new ProgressEvent("error"));
    const result = await read;

    expect(result.specification.rules.has("RG-a")).toBe(true);
    expect(result.unconfirmed?.cause).toContain("injoignable");
    expect(Date.parse(result.unconfirmed!.readAt)).not.toBeNaN();
    http.verify();
  });

  it("échoue plutôt que de fonder une lecture faite pour écrire sur un état non confirmé", async () => {
    let loader = newVisit();
    const read = readAll(loader);
    tree("c1", { "rules/RG-a.md": "a1" });
    await waitFor();
    http.expectOne(`${RAW}/c1/rules/RG-a.md`).flush(RULE("RG-a"));
    await read;

    loader = newVisit();
    const failure = loader.loadSpecification(REPO);
    await waitFor();
    http
      .expectOne(`${API}/git/trees/HEAD?recursive=1`)
      .error(new ProgressEvent("error"));
    await expect(failure).rejects.toBeInstanceOf(GithubError);
  });

  it("efface ce qu’il détient d’un dépôt dont la plateforme refuse l’accès", async () => {
    let loader = newVisit();
    let read = readAll(loader);
    tree("c1", { "rules/RG-a.md": "a1" });
    await waitFor();
    http.expectOne(`${RAW}/c1/rules/RG-a.md`).flush(RULE("RG-a"));
    await read;

    loader = newVisit();
    read = readAll(loader);
    await waitFor();
    http
      .expectOne(`${API}/git/trees/HEAD?recursive=1`)
      .flush(
        { message: "Not Found" },
        { status: 404, statusText: "Not Found" },
      );
    await expect(read).rejects.toBeInstanceOf(GithubError);

    // Ni dernier état connu, ni contenu : tout est redemandé.
    loader = newVisit();
    read = readAll(loader);
    await waitFor();
    http
      .expectOne(`${API}/git/trees/HEAD?recursive=1`)
      .error(new ProgressEvent("error"));
    await expect(read).rejects.toBeInstanceOf(GithubError);

    loader = newVisit();
    read = readAll(loader);
    tree("c1", { "rules/RG-a.md": "a1" });
    await waitFor();
    http.expectOne(`${RAW}/c1/rules/RG-a.md`).flush(RULE("RG-a"));
    await read;
    http.verify();
  });

  it("ne garde pas au-delà de l’onglet un dépôt privé lu sous un accès temporaire", async () => {
    const readPrivate = async () => {
      const loader = newVisit();
      inject(TokenService).setAccess({
        token: "ghs_accesTemporaire",
        validUntil: new Date(Date.now() + 3_600_000).toISOString(),
        repos: ["org/projet"],
        identity: { identifier: "u", name: "U", email: null },
      });
      inject(GithubClient).useApiForContents(true);
      // Enveloppé : rendre la promesse elle-même la ferait attendre ici.
      const inProgress = { read: readAll(loader) };
      await waitFor();
      return inProgress;
    };

    let { read } = await readPrivate();
    tree("c1", { "rules/RG-a.md": "a1" });
    await waitFor();
    http.expectOne(`${API}/git/blobs/a1`).flush(RULE("RG-a"));
    await read;

    ({ read: read } = await readPrivate());
    // Ni état connu, donc pas de condition ; ni contenu, donc redemandé.
    const query = http.expectOne(`${API}/git/trees/HEAD?recursive=1`);
    expect(query.request.headers.has("If-None-Match")).toBe(false);
    query.flush({
      sha: "c1",
      truncated: false,
      tree: [{ path: "rules/RG-a.md", sha: "a1", type: "blob" }],
    });
    await waitFor();
    http.expectOne(`${API}/git/blobs/a1`).flush(RULE("RG-a"));
    await read;
    http.verify();
  });
});
