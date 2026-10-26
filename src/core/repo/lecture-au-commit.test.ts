import {
  HttpTestingController,
  provideHttpTesting,
} from "../http/http-testing";
import { inject, resetInjection } from "../injection";
import { beforeEach, describe, expect, it } from "vitest";
import { RepoLoader } from "./repo-loader";

/**
 * Après un enregistrement, la vue lecture montrait l'état d'avant pendant
 * plusieurs minutes : `raw` sert avec `max-age: 300`, et l'URL d'une branche ne
 * change pas quand son contenu change. Lire au SHA du commit — que l'appel
 * d'arborescence rend déjà — donne une URL neuve à chaque écriture, donc jamais
 * servie depuis un cache.
 */
describe("lecture des contenus au commit", () => {
  let httpMock: HttpTestingController;

  beforeEach(() => {
    resetInjection();

    httpMock = provideHttpTesting();
  });

  it("demande le fichier au commit résolu, non au nom de la branche", async () => {
    const loader = inject(RepoLoader);
    const expected = loader.loadSpecification({
      owner: "org",
      repo: "projet",
      ref: "cadrage-2026-006",
    });

    const tree = httpMock.expectOne(
      "https://api.github.com/repos/org/projet/git/trees/cadrage-2026-006?recursive=1",
    );
    tree.flush({
      sha: "c0mm17",
      truncated: false,
      tree: [{ path: "rules/RG-exemple.md", sha: "b10b", type: "blob" }],
    });

    // Le chargement des contenus n'est lancé qu'une fois l'arborescence rendue :
    // laisser tourner la file d'attente avant de réclamer la requête suivante.
    await new Promise((r) => setTimeout(r, 0));

    const content = httpMock.expectOne(
      "https://raw.githubusercontent.com/org/projet/c0mm17/rules/RG-exemple.md",
    );
    content.flush("---\nid: RG-exemple\nstatut: actif\n---\n\nUn énoncé.\n");

    const specification = await expected;
    expect(specification.rules.get("RG-exemple")).toBeTruthy();
    httpMock.verify();
  });
});
