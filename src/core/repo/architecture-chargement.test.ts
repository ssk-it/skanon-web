import {
  HttpTestingController,
  provideHttpTesting,
} from "../http/http-testing";
import { inject, resetInjection } from "../injection";
import { beforeEach, describe, expect, it } from "vitest";
import { RepoLoader } from "./repo-loader";

/**
 * Le référentiel porte, depuis le cadrage 2026-038, ce qui décrit comment le
 * produit est construit : décisions d'architecture et documents d'architecture.
 *
 * Ce qui est éprouvé ici est le chargement — la seule étape où une nature
 * inconnue disparaît sans bruit. Un fichier rangé dans un répertoire que le
 * chargeur ignore n'est pas signalé comme anomalie : il n'existe simplement
 * pas, et rien dans l'application ne dit qu'il a été écarté.
 */
describe("chargement des cibles d’architecture", () => {
  let httpMock: HttpTestingController;

  beforeEach(() => {
    resetInjection();

    httpMock = provideHttpTesting();
  });

  /** Répond à l'arborescence puis au contenu de chaque fichier annoncé. */
  async function servir(
    fichiers: readonly { chemin: string; contenu: string }[],
  ) {
    const arbre = httpMock.expectOne(
      "https://api.github.com/repos/org/projet/git/trees/main?recursive=1",
    );
    arbre.flush({
      sha: "c0mm17",
      truncated: false,
      tree: fichiers.map((f) => ({
        path: f.chemin,
        sha: "b10b",
        type: "blob",
      })),
    });

    // Le chargement des contenus n'est lancé qu'une fois l'arborescence rendue :
    // laisser tourner la file d'attente avant de réclamer les requêtes suivantes.
    await new Promise((r) => setTimeout(r, 0));

    for (const f of fichiers) {
      httpMock
        .expectOne(
          `https://raw.githubusercontent.com/org/projet/c0mm17/${f.chemin}`,
        )
        .flush(f.contenu);
    }
  }

  it("charge une décision d’architecture", async () => {
    const loader = inject(RepoLoader);
    const attendu = loader.loadReferentiel({
      owner: "org",
      repo: "projet",
      ref: "main",
    });

    await servir([
      {
        chemin: "decisions/ADR-stockage.md",
        contenu:
          "---\nid: ADR-stockage\nstatut: actif\ncree_par: 2026-038\nmodifie_par: []\n---\n\nLe stockage est objet.\n",
      },
    ]);

    const referentiel = await attendu;
    const adr = referentiel.decisions.get("ADR-stockage");
    expect(adr, "la décision n’a pas été chargée").toBeTruthy();
    expect(adr?.enonce).toBe("Le stockage est objet.");
    expect(adr?.creePar).toBe("2026-038");
  });

  it("charge un document d’architecture avec sa nature et ses composants", async () => {
    const loader = inject(RepoLoader);
    const attendu = loader.loadReferentiel({
      owner: "org",
      repo: "projet",
      ref: "main",
    });

    await servir([
      {
        chemin: "architecture/FLX-export.md",
        contenu:
          "---\nid: FLX-export\nnature: flux\ncomposants: [api, stockage]\nstatut: actif\ncree_par: 2026-038\nmodifie_par: []\n---\n\nUn export nocturne.\n",
      },
    ]);

    const referentiel = await attendu;
    const flux = referentiel.architecture.get("FLX-export");
    expect(flux, "le document n’a pas été chargé").toBeTruthy();
    expect(flux?.nature).toBe("flux");
    expect(flux?.composants).toEqual(["api", "stockage"]);
  });

  it("rend calculable la relation d’un composant vers les flux qui le touchent", async () => {
    const loader = inject(RepoLoader);
    const attendu = loader.loadReferentiel({
      owner: "org",
      repo: "projet",
      ref: "main",
    });

    await servir([
      {
        chemin: "architecture/CMP-api.md",
        contenu:
          "---\nid: CMP-api\nnature: composant\nstatut: actif\n---\n\nL’API.\n",
      },
      {
        chemin: "architecture/FLX-export.md",
        contenu:
          "---\nid: FLX-export\nnature: flux\ncomposants: [CMP-api]\nstatut: actif\n---\n\nUn export.\n",
      },
      {
        chemin: "architecture/FLX-autre.md",
        contenu:
          "---\nid: FLX-autre\nnature: flux\ncomposants: [CMP-autre]\nstatut: actif\n---\n\nUn autre.\n",
      },
    ]);

    const referentiel = await attendu;
    // La relation ne se tient pas à la main : elle se lit des documents eux-mêmes.
    const touchants = [...referentiel.architecture.values()].filter((d) =>
      d.composants.includes("CMP-api"),
    );
    expect(touchants.map((d) => d.id)).toEqual(["FLX-export"]);
  });

  it("lit un impact visant une décision ou un document d’architecture", async () => {
    const loader = inject(RepoLoader);
    const attendu = loader.loadReferentiel({
      owner: "org",
      repo: "projet",
      ref: "main",
    });

    await servir([
      {
        chemin: "cadrages/2026-001/cadrage.md",
        contenu:
          "---\nid: 2026-001\ntitre: Un cadrage\nimpacts:\n  - { adr: ADR-stockage, operation: cree }\n  - { architecture: FLX-export, operation: modifie }\n  - { regle: RG-a, operation: touche }\n---\n\n## Objectif\n\nUn objectif.\n",
      },
    ]);

    const referentiel = await attendu;
    const impacts = referentiel.cadrages.get("2026-001")?.impacts ?? [];
    expect(impacts.length).toBe(3);
    // Chaque impact sait ce qu'il vise : sans cela, l'application afficherait
    // trois lignes indiscernables, toutes présentées comme des règles.
    expect(impacts.map((i) => i.cible)).toEqual([
      "ADR-stockage",
      "FLX-export",
      "RG-a",
    ]);
    expect(impacts.map((i) => i.nature)).toEqual([
      "adr",
      "architecture",
      "regle",
    ]);
  });
});
