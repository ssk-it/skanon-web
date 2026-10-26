import {
  HttpTestingController,
  provideHttpTesting,
} from "../http/http-testing";
import { inject, provide, resetInjection } from "../injection";
import { beforeEach, describe, expect, it } from "vitest";
import { IDBFactory } from "fake-indexeddb";
import { RepoLoader } from "./repo-loader";
import { FABRIQUE_INDEXEDDB } from "./contenus-cache";
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
  const DEPOT = { owner: "org", repo: "projet" };
  const API = "https://api.github.com/repos/org/projet";
  const RAW = "https://raw.githubusercontent.com/org/projet";
  const REGLE = (id: string) =>
    `---\nid: ${id}\nstatut: actif\n---\n\nUn énoncé.\n`;

  let fabrique: IDBFactory;
  let http: HttpTestingController;

  function nouvelleVisite(): RepoLoader {
    resetInjection();
    provide(FABRIQUE_INDEXEDDB, fabrique);
    http = provideHttpTesting();
    return inject(RepoLoader);
  }

  function arbre(
    commit: string,
    fichiers: Record<string, string>,
    ref = "HEAD",
  ) {
    http.expectOne(`${API}/git/trees/${ref}?recursive=1`).flush(
      {
        sha: commit,
        truncated: false,
        tree: Object.entries(fichiers).map(([path, sha]) => ({
          path,
          sha,
          type: "blob",
        })),
      },
      { headers: { etag: `"${commit}"` } },
    );
  }

  /** Laisse tourner les files d'attente et le stockage avant la suite. */
  async function attendre(): Promise<void> {
    for (let i = 0; i < 20; i++) await new Promise((r) => setTimeout(r, 0));
  }

  async function lireTout(
    loader: RepoLoader,
    options = { memoriser: true, dernierEtatConnu: true },
    ref?: string,
  ) {
    return loader.readReferentiel(ref ? { ...DEPOT, ref } : DEPOT, options);
  }

  beforeEach(() => {
    fabrique = new IDBFactory();
  });

  it("ne redemande pas, à la visite suivante, un fichier que le poste détient", async () => {
    let loader = nouvelleVisite();
    let lecture = lireTout(loader);
    arbre("c1", { "rules/RG-a.md": "a1", "rules/RG-b.md": "b1" });
    await attendre();
    http.expectOne(`${RAW}/c1/rules/RG-a.md`).flush(REGLE("RG-a"));
    http.expectOne(`${RAW}/c1/rules/RG-b.md`).flush(REGLE("RG-b"));
    await lecture;

    // Un commit plus tard, seule RG-b a changé.
    loader = nouvelleVisite();
    lecture = lireTout(loader);
    arbre("c2", { "rules/RG-a.md": "a1", "rules/RG-b.md": "b2" });
    await attendre();
    http.expectOne(`${RAW}/c2/rules/RG-b.md`).flush(REGLE("RG-b"));
    const resultat = await lecture;

    expect([...resultat.referentiel.regles.keys()].sort()).toEqual([
      "RG-a",
      "RG-b",
    ]);
    expect(resultat.nonConfirme).toBeNull();
    http.verify();
  });

  it("partage le cache entre la branche principale et une branche de cadrage", async () => {
    const loader = nouvelleVisite();
    const principale = lireTout(loader);
    arbre("c1", { "rules/RG-a.md": "a1" });
    await attendre();
    http.expectOne(`${RAW}/c1/rules/RG-a.md`).flush(REGLE("RG-a"));
    await principale;

    const branche = lireTout(
      loader,
      { memoriser: true, dernierEtatConnu: false },
      "cadrage-2026-001",
    );
    arbre(
      "c9",
      { "rules/RG-a.md": "a1", "cadrages/2026-001/cadrage.md": "k1" },
      "cadrage-2026-001",
    );
    await attendre();
    // Seul ce que la branche a en propre est demandé.
    http
      .expectOne(`${RAW}/c9/cadrages/2026-001/cadrage.md`)
      .flush("---\nid: 2026-001\ntitre: Un cadrage\n---\n");
    const resultat = await branche;

    expect(resultat.empreintes).toEqual(new Set(["a1", "k1"]));
    http.verify();
  });

  it("demande l’arborescence sous condition quand l’utilisateur est connecté", async () => {
    let loader = nouvelleVisite();
    inject(TokenService).definir("ghp_jetonDeTestSuffisammentLong");
    let lecture = lireTout(loader);
    // Connecté, l'état connu est consulté avant que l'arborescence parte.
    await attendre();
    arbre("c1", { "rules/RG-a.md": "a1" });
    await attendre();
    http.expectOne(`${RAW}/c1/rules/RG-a.md`).flush(REGLE("RG-a"));
    await lecture;

    loader = nouvelleVisite();
    inject(TokenService).definir("ghp_jetonDeTestSuffisammentLong");
    lecture = lireTout(loader);
    await attendre();
    const conditionnelle = http.expectOne(`${API}/git/trees/HEAD?recursive=1`);
    expect(conditionnelle.request.headers.get("If-None-Match")).toBe('"c1"');
    // Inchangée : la plateforme ne décompte rien, et rien d'autre n'est demandé.
    conditionnelle.flush(null, { status: 304, statusText: "Not Modified" });
    const resultat = await lecture;

    expect(resultat.referentiel.regles.has("RG-a")).toBe(true);
    expect(resultat.nonConfirme).toBeNull();
    http.verify();
  });

  it("ne pose pas de condition sans connexion, où elle serait décomptée quand même", async () => {
    let loader = nouvelleVisite();
    let lecture = lireTout(loader);
    arbre("c1", { "rules/RG-a.md": "a1" });
    await attendre();
    http.expectOne(`${RAW}/c1/rules/RG-a.md`).flush(REGLE("RG-a"));
    await lecture;

    loader = nouvelleVisite();
    lecture = lireTout(loader);
    await attendre();
    const requete = http.expectOne(`${API}/git/trees/HEAD?recursive=1`);
    expect(requete.request.headers.has("If-None-Match")).toBe(false);
    requete.flush({
      sha: "c1",
      truncated: false,
      tree: [{ path: "rules/RG-a.md", sha: "a1", type: "blob" }],
    });
    await lecture;
    http.verify();
  });

  it("montre le dernier état lu, daté et marqué, quand le dépôt ne répond pas", async () => {
    let loader = nouvelleVisite();
    let lecture = lireTout(loader);
    arbre("c1", { "rules/RG-a.md": "a1" });
    await attendre();
    http.expectOne(`${RAW}/c1/rules/RG-a.md`).flush(REGLE("RG-a"));
    await lecture;

    loader = nouvelleVisite();
    lecture = lireTout(loader);
    await attendre();
    http
      .expectOne(`${API}/git/trees/HEAD?recursive=1`)
      .error(new ProgressEvent("error"));
    const resultat = await lecture;

    expect(resultat.referentiel.regles.has("RG-a")).toBe(true);
    expect(resultat.nonConfirme?.cause).toContain("injoignable");
    expect(Date.parse(resultat.nonConfirme!.lu)).not.toBeNaN();
    http.verify();
  });

  it("échoue plutôt que de fonder une lecture faite pour écrire sur un état non confirmé", async () => {
    let loader = nouvelleVisite();
    const lecture = lireTout(loader);
    arbre("c1", { "rules/RG-a.md": "a1" });
    await attendre();
    http.expectOne(`${RAW}/c1/rules/RG-a.md`).flush(REGLE("RG-a"));
    await lecture;

    loader = nouvelleVisite();
    const echec = loader.loadReferentiel(DEPOT);
    await attendre();
    http
      .expectOne(`${API}/git/trees/HEAD?recursive=1`)
      .error(new ProgressEvent("error"));
    await expect(echec).rejects.toBeInstanceOf(GithubError);
  });

  it("efface ce qu’il détient d’un dépôt dont la plateforme refuse l’accès", async () => {
    let loader = nouvelleVisite();
    let lecture = lireTout(loader);
    arbre("c1", { "rules/RG-a.md": "a1" });
    await attendre();
    http.expectOne(`${RAW}/c1/rules/RG-a.md`).flush(REGLE("RG-a"));
    await lecture;

    loader = nouvelleVisite();
    lecture = lireTout(loader);
    await attendre();
    http
      .expectOne(`${API}/git/trees/HEAD?recursive=1`)
      .flush(
        { message: "Not Found" },
        { status: 404, statusText: "Not Found" },
      );
    await expect(lecture).rejects.toBeInstanceOf(GithubError);

    // Ni dernier état connu, ni contenu : tout est redemandé.
    loader = nouvelleVisite();
    lecture = lireTout(loader);
    await attendre();
    http
      .expectOne(`${API}/git/trees/HEAD?recursive=1`)
      .error(new ProgressEvent("error"));
    await expect(lecture).rejects.toBeInstanceOf(GithubError);

    loader = nouvelleVisite();
    lecture = lireTout(loader);
    arbre("c1", { "rules/RG-a.md": "a1" });
    await attendre();
    http.expectOne(`${RAW}/c1/rules/RG-a.md`).flush(REGLE("RG-a"));
    await lecture;
    http.verify();
  });

  it("ne garde pas au-delà de l’onglet un dépôt privé lu sous un accès temporaire", async () => {
    const lirePrive = async () => {
      const loader = nouvelleVisite();
      inject(TokenService).definirAcces({
        jeton: "ghs_accesTemporaire",
        valideJusqua: new Date(Date.now() + 3_600_000).toISOString(),
        depots: ["org/projet"],
        identite: { identifiant: "u", nom: "U", courriel: null },
      });
      inject(GithubClient).useApiForContenus(true);
      // Enveloppé : rendre la promesse elle-même la ferait attendre ici.
      const enCours = { lecture: lireTout(loader) };
      await attendre();
      return enCours;
    };

    let { lecture } = await lirePrive();
    arbre("c1", { "rules/RG-a.md": "a1" });
    await attendre();
    http.expectOne(`${API}/git/blobs/a1`).flush(REGLE("RG-a"));
    await lecture;

    ({ lecture } = await lirePrive());
    // Ni état connu, donc pas de condition ; ni contenu, donc redemandé.
    const requete = http.expectOne(`${API}/git/trees/HEAD?recursive=1`);
    expect(requete.request.headers.has("If-None-Match")).toBe(false);
    requete.flush({
      sha: "c1",
      truncated: false,
      tree: [{ path: "rules/RG-a.md", sha: "a1", type: "blob" }],
    });
    await attendre();
    http.expectOne(`${API}/git/blobs/a1`).flush(REGLE("RG-a"));
    await lecture;
    http.verify();
  });
});
