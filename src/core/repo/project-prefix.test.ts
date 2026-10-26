import {
  HttpTestingController,
  provideHttpTesting,
} from "../http/http-testing";
import { inject, resetInjection } from "../injection";
import { beforeEach, describe, expect, it } from "vitest";
import { RepoLoader } from "./repo-loader";
import {
  displayIdentifier,
  extractScopingIdentifier,
} from "./scoping-reference";

/**
 * Le préfixe de projet — RG-prefixe-projet.
 *
 * Il s'ajoute à l'affichage et est accepté en entrée, sans rien changer à ce qui
 * est stocké. C'est cette asymétrie qui compte : les identifiants déjà posés
 * dans des issues, des demandes de fusion ou des cartes restent valides, et rien
 * ne peut les rattraper s'ils cessaient de l'être.
 */
describe("préfixe déclaré par le projet", () => {
  let httpMock: HttpTestingController;

  beforeEach(() => {
    resetInjection();

    httpMock = provideHttpTesting();
  });

  async function loadWithConfig(config: string) {
    const loader = inject(RepoLoader);
    const expected = loader.loadSpecification({
      owner: "org",
      repo: "projet",
      ref: "main",
    });

    httpMock
      .expectOne(
        "https://api.github.com/repos/org/projet/git/trees/main?recursive=1",
      )
      .flush({
        sha: "c0mm17",
        truncated: false,
        tree: [{ path: "ssk-canon.yml", sha: "b10b", type: "blob" }],
      });

    await new Promise((r) => setTimeout(r, 0));
    httpMock
      .expectOne(
        "https://raw.githubusercontent.com/org/projet/c0mm17/ssk-canon.yml",
      )
      .flush(config);

    return expected;
  }

  it("lit le préfixe déclaré sous le projet", async () => {
    const specification = await loadWithConfig(
      "schema_version: 1\nprojet:\n  nom: Prime\n  prefixe: PRMCO\n",
    );

    expect(specification.project.prefix).toBe("PRMCO");
  });

  it("laisse le préfixe vide quand le projet n’en déclare pas", async () => {
    // Le cas de tous les projets existants : rien ne doit changer pour eux.
    const specification = await loadWithConfig(
      "schema_version: 1\nprojet:\n  nom: Prime\n",
    );

    expect(specification.project.prefix).toBeNull();
  });
});

describe("affichage d’un identifiant", () => {
  it("préfixe l’identifiant quand le projet en déclare un", () => {
    expect(displayIdentifier("2026-002", "PRMCO")).toBe("PRMCO-2026-002");
  });

  it("rend l’identifiant nu quand aucun préfixe n’est déclaré", () => {
    expect(displayIdentifier("2026-002", null)).toBe("2026-002");
  });
});

/**
 * Le routage accepte les deux formes — RG-prefixe-projet.
 *
 * L'adresse nue reste valide et reste canonique : c'est elle qui a été posée
 * dans les issues et les demandes de fusion, et rien ne peut la rattraper si
 * elle cessait de fonctionner. L'adresse préfixée s'ajoute.
 */
describe("adresse préfixée", () => {
  it("mène au même cadrage que l’adresse nue", () => {
    expect(extractScopingIdentifier("PRMCO-2026-002", "PRMCO")).toBe(
      "2026-002",
    );
    expect(extractScopingIdentifier("2026-002", "PRMCO")).toBe("2026-002");
  });

  it("refuse le préfixe d’un autre projet", () => {
    expect(extractScopingIdentifier("AUTRE-2026-002", "PRMCO")).toBeNull();
  });
});
