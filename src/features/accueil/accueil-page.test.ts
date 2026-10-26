import { flushPromises, mount } from "@vue/test-utils";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { createMemoryHistory } from "vue-router";
import type { RefDepot } from "../../core/github/github-client";
import { TokenService } from "../../core/github/token.service";
import { inject, provide, resetInjection } from "../../core/injection";
import {
  DepotsConnusService,
  type DepotConnu,
} from "../../core/repo/depots-connus.service";
import { IdentitesService } from "../../core/repo/identites.service";
import { signal } from "../../core/signaux";
import { createRouteur } from "../../routeur";
import { DialogService } from "../../ui/dialog.service";
import AccueilPage from "./AccueilPage.vue";

/**
 * Une fois tous les référentiels reconnus, la liste en compte plusieurs dizaines, de plusieurs organisations : sans regroupement, on y cherche le sien ligne à ligne.
 */
describe("écran « Ouvrir un projet »", () => {
  const connu = (nom: string, cadre: boolean, recent = false): DepotConnu => {
    const [owner, repo] = nom.split("/");
    return { depot: { owner, repo }, cadre, recent };
  };

  const SYMBOLE = "data:image/svg+xml;base64,c3ltYm9sZQ==";
  /** Les dépôts dont l'identité a été demandée, et ceux qui en ont une. */
  let demandes: string[];
  let avecSymbole: string[];
  let relectures: number;

  async function monter(depots: DepotConnu[]): Promise<HTMLElement> {
    demandes = [];
    relectures = 0;
    provide(DepotsConnusService, {
      depots: signal(depots),
      enCours: signal(false),
      erreur: signal(null),
      rafraichir: async () => {},
    });
    provide(IdentitesService, {
      generation: signal(0),
      findSymbole: (d: RefDepot) =>
        avecSymbole.includes(d.repo) ? SYMBOLE : null,
      demander: async (d: RefDepot) =>
        void demandes.push(`${d.owner}/${d.repo}`),
      relire: () => void relectures++,
    });
    const router = createRouteur(createMemoryHistory());
    await router.push("/");
    await router.isReady();
    const vue = mount(AccueilPage, { global: { plugins: [router] } });
    await flushPromises();
    return vue.element as HTMLElement;
  }

  beforeEach(() => {
    avecSymbole = [];
    resetInjection();
    Object.defineProperty(globalThis, "localStorage", {
      configurable: true,
      value: {
        getItem: () => null,
        setItem: () => {},
        removeItem: () => {},
        clear: () => {},
      },
    });
  });

  const textes = (racine: Element, selecteur: string) =>
    [...racine.querySelectorAll(selecteur)].map((e) => e.textContent?.trim());

  it("présente les référentiels groupés par organisation", async () => {
    const page = await monter([
      connu("ssk-it/skift-cadrage", true, true),
      connu("Wayne-Corp/wayne-devis-cadrage", true),
      connu("ssk-it/mnesisk-cadrage", true),
      connu("ssk-it/skift", false),
    ]);

    const principaux = page.querySelector(".cadres")!;
    expect(textes(principaux, ".organisation h2")).toEqual([
      "ssk-it",
      "Wayne-Corp",
    ]);
    expect(textes(principaux, ".organisation:first-child .nom")).toEqual([
      "mnesisk-cadrage",
      "skift-cadrage",
    ]);
  });

  it("montre l’avatar de chaque organisation à côté de son nom", async () => {
    const page = await monter([
      connu("ssk-it/skift-cadrage", true),
      connu("Wayne-Corp/wayne-devis-cadrage", true),
    ]);

    const sources = [...page.querySelectorAll(".organisation h2 img")].map(
      (i) => i.getAttribute("src"),
    );
    expect(sources).toHaveLength(2);
    expect(sources[0]).toContain("avatars.githubusercontent.com/ssk-it?");
    expect(sources[1]).toContain("avatars.githubusercontent.com/Wayne-Corp?");
  });

  /** RG-identite-affichee, RG-lecture-identite. */
  it("montre le symbole d’un projet à la place du dossier, et le dossier sans symbole", async () => {
    avecSymbole = ["skift-cadrage"];
    const page = await monter([
      connu("ssk-it/skift-cadrage", true),
      connu("ssk-it/mnesisk-cadrage", true),
    ]);

    const [mnesisk, skift] = [...page.querySelectorAll(".cadres .depot")];
    expect(skift.querySelector("img.symbole")?.getAttribute("src")).toBe(
      SYMBOLE,
    );
    expect(skift.querySelector(".material-symbols-outlined")).toBeNull();
    expect(mnesisk.querySelector("img.symbole")).toBeNull();
    expect(
      mnesisk.querySelector(".material-symbols-outlined")?.textContent?.trim(),
    ).toBe("folder");
  });

  it("redemande les identités à chaque retour, sans en lire pour les dépôts sans référentiel", async () => {
    avecSymbole = [];
    await monter([
      connu("ssk-it/skift-cadrage", true),
      connu("ssk-it/skift", false),
    ]);

    expect(relectures).toBe(1);
    // L'identité vit dans le référentiel : un dépôt qui n'en porte pas n'a rien à montrer, et le lire coûterait un appel par dépôt de code.
    expect(demandes).toEqual(["ssk-it/skift-cadrage"]);
  });

  it("groupe aussi les dépôts sans référentiel, toujours repliés", async () => {
    const page = await monter([
      connu("ssk-it/skift-cadrage", true),
      connu("ssk-it/skift", false),
      connu("Globex/site", false),
    ]);

    const autres = page.querySelector("details.autres")!;
    expect(autres.hasAttribute("open")).toBe(false);
    expect(textes(autres, "summary")).toEqual(["Autres dépôts autorisés (2)"]);
    expect(textes(autres, ".organisation h2")).toEqual(["Globex", "ssk-it"]);
  });

  /** RG-connexion-optionnelle, RG-modes-acces : l'aide se propose sans se poser en préalable. */
  it("propose la connexion, facultative, avec la façon de créer un jeton, tant qu’aucun accès n’est en place", async () => {
    const page = await monter([connu("ssk-it/skift-cadrage", true, true)]);

    const connexion = page.querySelector(".connexion")!;
    expect(connexion.querySelector("h2")?.textContent).toContain("facultative");
    expect(connexion.textContent).toContain("dépôts publics se lisent sans");
    expect(connexion.querySelector(".aide-jeton h3")?.textContent).toBe(
      "Créer un jeton",
    );
    expect(
      connexion.querySelector(
        'a[href="https://github.com/settings/personal-access-tokens/new"]',
      ),
    ).not.toBeNull();
  });

  /** RG-acces-par-portee : un jeton d'une autre organisation que le dernier projet ouvert reste un accès en place. */
  it("ne la propose plus dès qu’un jeton est enregistré, quelle qu’en soit la portée", async () => {
    inject(TokenService).definirPourPortee(
      "wayne-corp",
      "ghp_abcdefghijklmnopqrst1234",
    );
    const page = await monter([connu("ssk-it/skift-cadrage", true, true)]);

    expect(page.querySelector(".connexion")).toBeNull();
  });

  it("ouvre la connexion, assez large pour l’aide, depuis l’accueil", async () => {
    const page = await monter([]);

    (page.querySelector(".connexion .ui-bouton") as HTMLElement).click();

    const dialog = inject(DialogService);
    await vi.waitFor(() => expect(dialog.ouverts()).toHaveLength(1));
    expect(dialog.ouverts()[0].options.largeur).toBe("680px");
    expect(dialog.ouverts()[0].options.largeurMax).toBe("calc(100vw - 32px)");
  });
});
