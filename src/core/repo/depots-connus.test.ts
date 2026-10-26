import {
  HttpTestingController,
  provideHttpTesting,
} from "../http/http-testing";
import { inject, resetInjection } from "../injection";
import { beforeEach, describe, expect, it } from "vitest";
import {
  DepotConnu,
  DepotsConnusService,
  groupDepotsByOrganisation,
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
  const JETON_SSK = "ghp_ssk_aaaaaaaaaaaaaaaa";
  const JETON_WAYNE = "ghp_wayne_aaaaaaaaaaaaaa";

  /** Ce que chaque jeton atteint, comme GitHub le dirait. */
  const PORTEE: Record<string, readonly string[]> = {
    [JETON_SSK]: ["ssk-it/skift-cadrage", "ssk-it/skift"],
    [JETON_WAYNE]: ["Wayne-Corp/wayne-devis-cadrage"],
  };
  const CADRES = ["ssk-it/skift-cadrage", "Wayne-Corp/wayne-devis-cadrage"];

  let http: HttpTestingController;
  let stockage: Record<string, string>;

  beforeEach(() => {
    stockage = {};
    Object.defineProperty(globalThis, "localStorage", {
      configurable: true,
      value: {
        getItem: (c: string) => stockage[c] ?? null,
        setItem: (c: string, v: string) => void (stockage[c] = v),
        removeItem: (c: string) => void delete stockage[c],
        clear: () => void (stockage = {}),
      },
    });
    resetInjection();

    http = provideHttpTesting();
  });

  /**
   * Répond à chaque appel en jouant GitHub : un dépôt hors de portée du jeton
   * présenté est introuvable, comme la plateforme le dit d'un dépôt privé.
   */
  async function jouerGithub(): Promise<void> {
    for (let tour = 0; tour < 50; tour++) {
      for (const requete of http.match(() => true)) {
        const jeton =
          requete.request.headers
            .get("Authorization")
            ?.replace("Bearer ", "") ?? "";
        const atteints = PORTEE[jeton] ?? [];
        const url = requete.request.url;

        if (url.includes("/user/repos")) {
          requete.flush(
            atteints.map((nom) => {
              const [owner, name] = nom.split("/");
              return { owner: { login: owner }, name };
            }),
          );
          continue;
        }

        const contenu =
          /\/repos\/([^/]+\/[^/]+)\/contents\/ssk-canon\.yml/.exec(url);
        if (contenu) {
          const nom = contenu[1];
          if (atteints.includes(nom) && CADRES.includes(nom)) requete.flush({});
          else requete.flush(null, { status: 404, statusText: "Not Found" });
          continue;
        }
        throw new Error(`Appel inattendu : ${url}`);
      }
      await new Promise((r) => setTimeout(r, 0));
    }
  }

  it("reconnaît les référentiels de chaque organisation, sous le jeton qui l’atteint", async () => {
    const tokens = inject(TokenService);
    tokens.definirPourPortee("ssk-it", JETON_SSK);
    tokens.definirPourPortee("wayne-corp", JETON_WAYNE);
    // L'écran de choix est montré alors qu'un projet ssk-it était ouvert.
    tokens.cibler({ owner: "ssk-it", repo: "skift-cadrage" });

    const connus = inject(DepotsConnusService);
    const fin = connus.rafraichir();
    await jouerGithub();
    await fin;

    const cadres = connus
      .depots()
      .filter((d) => d.cadre)
      .map((d) => `${d.depot.owner}/${d.depot.repo}`);
    expect(cadres.sort()).toEqual([...CADRES].sort());
    expect(connus.erreur()).toBeNull();
    // La cible partagée n'a pas été déplacée par la vérification.
    expect(tokens.cibleCourante()).toEqual({
      owner: "ssk-it",
      repo: "skift-cadrage",
    });
  });

  it("écrit un dépôt déjà ouvert comme GitHub le nomme", async () => {
    // Saisi à la main en minuscules : la plateforme ne distingue pas la casse,
    // mais deux graphies d'une organisation la couperaient en deux groupes.
    inject(RepoConfig).memoriserOuvert({
      owner: "wayne-corp",
      repo: "wayne-devis-cadrage",
    });
    inject(TokenService).definirPourPortee("wayne-corp", JETON_WAYNE);

    const connus = inject(DepotsConnusService);
    const fin = connus.rafraichir();
    await jouerGithub();
    await fin;

    expect(connus.depots()).toEqual([
      {
        depot: { owner: "Wayne-Corp", repo: "wayne-devis-cadrage" },
        cadre: true,
        recent: true,
      },
    ]);
  });
});

describe("regroupement des dépôts par organisation", () => {
  const connu = (nom: string, cadre: boolean, recent = false): DepotConnu => {
    const [owner, repo] = nom.split("/");
    return { depot: { owner, repo }, cadre, recent };
  };

  it("range les organisations par nom, et dans chacune les référentiels d’abord", () => {
    const groupes = groupDepotsByOrganisation([
      connu("ssk-it/skift", false),
      connu("Wayne-Corp/wayne-devis-cadrage", true),
      connu("ssk-it/skift-cadrage", true, true),
      connu("ssk-it/mnesisk-cadrage", true),
      connu("Globex/site", false),
    ]);

    expect(
      groupes.map((g) => [g.organisation, g.depots.map((d) => d.depot.repo)]),
    ).toEqual([
      ["Globex", ["site"]],
      ["ssk-it", ["mnesisk-cadrage", "skift-cadrage", "skift"]],
      ["Wayne-Corp", ["wayne-devis-cadrage"]],
    ]);
  });

  it("ne coupe pas une organisation en deux selon la casse", () => {
    const groupes = groupDepotsByOrganisation([
      connu("Wayne-Corp/wayne-stock-cadrage", true),
      connu("wayne-corp/wayne-chantier-cadrage", true),
    ]);

    expect(groupes).toHaveLength(1);
    expect(groupes[0].depots).toHaveLength(2);
  });
});
