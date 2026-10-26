import {
  HttpTestingController,
  provideHttpTesting,
} from "../http/http-testing";
import { inject, resetInjection } from "../injection";
import { beforeEach, describe, expect, it } from "vitest";
import {
  KnownRepo,
  KnownReposService,
  groupReposByOrganization,
} from "./depots-connus.service";
import { RepoConfig } from "./repo-config";
import { TokenService } from "../github/token.service";

/**
 * L'écran « Ouvrir un projet » ne montrait que les dépôts déjà ouverts : les
 * référentiels des autres organisations étaient vérifiés sous le jeton de la
 * cible courante, qui ne les atteint pas, et rangés parmi les dépôts sans
 * référentiel. Voir RG-projets-connus.
 */
describe("dépôts proposés à l’ouverture", () => {
  const SSK_TOKEN = "ghp_ssk_aaaaaaaaaaaaaaaa";
  const WAYNE_TOKEN = "ghp_wayne_aaaaaaaaaaaaaa";

  /** Ce que chaque jeton atteint, comme GitHub le dirait. */
  const SCOPE: Record<string, readonly string[]> = {
    [SSK_TOKEN]: ["ssk-it/skift-cadrage", "ssk-it/skift"],
    [WAYNE_TOKEN]: ["Wayne-Corp/wayne-devis-cadrage"],
  };
  const FRAMED_REPOS = [
    "ssk-it/skift-cadrage",
    "Wayne-Corp/wayne-devis-cadrage",
  ];

  let http: HttpTestingController;
  let storage: Record<string, string>;

  beforeEach(() => {
    storage = {};
    Object.defineProperty(globalThis, "localStorage", {
      configurable: true,
      value: {
        getItem: (c: string) => storage[c] ?? null,
        setItem: (c: string, v: string) => void (storage[c] = v),
        removeItem: (c: string) => void delete storage[c],
        clear: () => void (storage = {}),
      },
    });
    resetInjection();

    http = provideHttpTesting();
  });

  /**
   * Répond à chaque appel en jouant GitHub : un dépôt hors de portée du jeton
   * présenté est introuvable, comme la plateforme le dit d'un dépôt privé.
   */
  async function replayGithub(): Promise<void> {
    for (let round = 0; round < 50; round++) {
      for (const query of http.match(() => true)) {
        const token =
          query.request.headers.get("Authorization")?.replace("Bearer ", "") ??
          "";
        const reached = SCOPE[token] ?? [];
        const url = query.request.url;

        if (url.includes("/user/repos")) {
          query.flush(
            reached.map((fullName) => {
              const [owner, name] = fullName.split("/");
              return { owner: { login: owner }, name };
            }),
          );
          continue;
        }

        const content =
          /\/repos\/([^/]+\/[^/]+)\/contents\/ssk-canon\.yml/.exec(url);
        if (content) {
          const name = content[1];
          if (reached.includes(name) && FRAMED_REPOS.includes(name))
            query.flush({});
          else query.flush(null, { status: 404, statusText: "Not Found" });
          continue;
        }
        throw new Error(`Appel inattendu : ${url}`);
      }
      await new Promise((r) => setTimeout(r, 0));
    }
  }

  it("reconnaît les référentiels de chaque organisation, sous le jeton qui l’atteint", async () => {
    const tokens = inject(TokenService);
    tokens.setForScope("ssk-it", SSK_TOKEN);
    tokens.setForScope("wayne-corp", WAYNE_TOKEN);
    // L'écran de choix est montré alors qu'un projet ssk-it était ouvert.
    tokens.targetRepo({ owner: "ssk-it", repo: "skift-cadrage" });

    const known = inject(KnownReposService);
    const end = known.refresh();
    await replayGithub();
    await end;

    const framedRepos = known
      .repos()
      .filter((d) => d.framed)
      .map((d) => `${d.repoRef.owner}/${d.repoRef.repo}`);
    expect(framedRepos.sort()).toEqual([...FRAMED_REPOS].sort());
    expect(known.error()).toBeNull();
    // La cible partagée n'a pas été déplacée par la vérification.
    expect(tokens.currentTarget()).toEqual({
      owner: "ssk-it",
      repo: "skift-cadrage",
    });
  });

  it("écrit un dépôt déjà ouvert comme GitHub le nomme", async () => {
    // Saisi à la main en minuscules : la plateforme ne distingue pas la casse,
    // mais deux graphies d'une organisation la couperaient en deux groupes.
    inject(RepoConfig).rememberOpened({
      owner: "wayne-corp",
      repo: "wayne-devis-cadrage",
    });
    inject(TokenService).setForScope("wayne-corp", WAYNE_TOKEN);

    const known = inject(KnownReposService);
    const end = known.refresh();
    await replayGithub();
    await end;

    expect(known.repos()).toEqual([
      {
        repoRef: { owner: "Wayne-Corp", repo: "wayne-devis-cadrage" },
        framed: true,
        recent: true,
      },
    ]);
  });
});

describe("regroupement des dépôts par organisation", () => {
  const known = (name: string, framed: boolean, recent = false): KnownRepo => {
    const [owner, repo] = name.split("/");
    return { repoRef: { owner, repo }, framed, recent };
  };

  it("range les organisations par nom, et dans chacune les référentiels d’abord", () => {
    const groups = groupReposByOrganization([
      known("ssk-it/skift", false),
      known("Wayne-Corp/wayne-devis-cadrage", true),
      known("ssk-it/skift-cadrage", true, true),
      known("ssk-it/mnesisk-cadrage", true),
      known("Globex/site", false),
    ]);

    expect(
      groups.map((g) => [g.organization, g.repos.map((d) => d.repoRef.repo)]),
    ).toEqual([
      ["Globex", ["site"]],
      ["ssk-it", ["mnesisk-cadrage", "skift-cadrage", "skift"]],
      ["Wayne-Corp", ["wayne-devis-cadrage"]],
    ]);
  });

  it("ne coupe pas une organisation en deux selon la casse", () => {
    const groups = groupReposByOrganization([
      known("Wayne-Corp/wayne-stock-cadrage", true),
      known("wayne-corp/wayne-chantier-cadrage", true),
    ]);

    expect(groups).toHaveLength(1);
    expect(groups[0].repos).toHaveLength(2);
  });
});
