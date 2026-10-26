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
  async function serve(files: readonly { path: string; content: string }[]) {
    const tree = httpMock.expectOne(
      "https://api.github.com/repos/org/projet/git/trees/main?recursive=1",
    );
    tree.flush({
      sha: "c0mm17",
      truncated: false,
      tree: files.map((f) => ({
        path: f.path,
        sha: "b10b",
        type: "blob",
      })),
    });

    // Le chargement des contenus n'est lancé qu'une fois l'arborescence rendue :
    // laisser tourner la file d'attente avant de réclamer les requêtes suivantes.
    await new Promise((r) => setTimeout(r, 0));

    for (const f of files) {
      httpMock
        .expectOne(
          `https://raw.githubusercontent.com/org/projet/c0mm17/${f.path}`,
        )
        .flush(f.content);
    }
  }

  it("charge une décision d’architecture", async () => {
    const loader = inject(RepoLoader);
    const expected = loader.loadSpecification({
      owner: "org",
      repo: "projet",
      ref: "main",
    });

    await serve([
      {
        path: "decisions/ADR-stockage.md",
        content:
          "---\nid: ADR-stockage\nstatut: actif\ncree_par: 2026-038\nmodifie_par: []\n---\n\nLe stockage est objet.\n",
      },
    ]);

    const specification = await expected;
    const adr = specification.decisions.get("ADR-stockage");
    expect(adr, "la décision n’a pas été chargée").toBeTruthy();
    expect(adr?.statement).toBe("Le stockage est objet.");
    expect(adr?.createdBy).toBe("2026-038");
  });

  it("charge un document d’architecture avec sa nature et ses composants", async () => {
    const loader = inject(RepoLoader);
    const expected = loader.loadSpecification({
      owner: "org",
      repo: "projet",
      ref: "main",
    });

    await serve([
      {
        path: "architecture/FLX-export.md",
        content:
          "---\nid: FLX-export\nnature: flux\ncomposants: [api, stockage]\nstatut: actif\ncree_par: 2026-038\nmodifie_par: []\n---\n\nUn export nocturne.\n",
      },
    ]);

    const specification = await expected;
    const flows = specification.architecture.get("FLX-export");
    expect(flows, "le document n’a pas été chargé").toBeTruthy();
    expect(flows?.kind).toBe("flux");
    expect(flows?.components).toEqual(["api", "stockage"]);
  });

  it("rend calculable la relation d’un composant vers les flux qui le touchent", async () => {
    const loader = inject(RepoLoader);
    const expected = loader.loadSpecification({
      owner: "org",
      repo: "projet",
      ref: "main",
    });

    await serve([
      {
        path: "architecture/CMP-api.md",
        content:
          "---\nid: CMP-api\nnature: composant\nstatut: actif\n---\n\nL’API.\n",
      },
      {
        path: "architecture/FLX-export.md",
        content:
          "---\nid: FLX-export\nnature: flux\ncomposants: [CMP-api]\nstatut: actif\n---\n\nUn export.\n",
      },
      {
        path: "architecture/FLX-autre.md",
        content:
          "---\nid: FLX-autre\nnature: flux\ncomposants: [CMP-autre]\nstatut: actif\n---\n\nUn autre.\n",
      },
    ]);

    const specification = await expected;
    // La relation ne se tient pas à la main : elle se lit des documents eux-mêmes.
    const touching = [...specification.architecture.values()].filter((d) =>
      d.components.includes("CMP-api"),
    );
    expect(touching.map((d) => d.id)).toEqual(["FLX-export"]);
  });

  it("lit un impact visant une décision ou un document d’architecture", async () => {
    const loader = inject(RepoLoader);
    const expected = loader.loadSpecification({
      owner: "org",
      repo: "projet",
      ref: "main",
    });

    await serve([
      {
        path: "cadrages/2026-001/cadrage.md",
        content:
          "---\nid: 2026-001\ntitre: Un cadrage\nimpacts:\n  - { adr: ADR-stockage, operation: cree }\n  - { architecture: FLX-export, operation: modifie }\n  - { regle: RG-a, operation: touche }\n---\n\n## Objectif\n\nUn objectif.\n",
      },
    ]);

    const specification = await expected;
    const impacts = specification.scopings.get("2026-001")?.impacts ?? [];
    expect(impacts.length).toBe(3);
    // Chaque impact sait ce qu'il vise : sans cela, l'application afficherait
    // trois lignes indiscernables, toutes présentées comme des règles.
    expect(impacts.map((i) => i.target)).toEqual([
      "ADR-stockage",
      "FLX-export",
      "RG-a",
    ]);
    expect(impacts.map((i) => i.kind)).toEqual([
      "adr",
      "architecture",
      "regle",
    ]);
  });
});
