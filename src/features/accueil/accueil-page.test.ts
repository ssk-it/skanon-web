import { flushPromises, mount } from "@vue/test-utils";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { createMemoryHistory } from "vue-router";
import type { RepoRef } from "../../core/github/github-client";
import { TokenService } from "../../core/github/token.service";
import { inject, provide, resetInjection } from "../../core/injection";
import {
  KnownReposService,
  type KnownRepo,
} from "../../core/repo/depots-connus.service";
import { ProjectIdentityService } from "../../core/repo/identites.service";
import { signal } from "../../core/signaux";
import { createAppRouter } from "../../routeur";
import { DialogService } from "../../ui/dialog.service";
import HomePage from "./AccueilPage.vue";

/**
 * Une fois tous les référentiels reconnus, la liste en compte plusieurs dizaines, de plusieurs organisations : sans regroupement, on y cherche le sien ligne à ligne.
 */
describe("écran « Ouvrir un projet »", () => {
  const known = (name: string, framed: boolean, recent = false): KnownRepo => {
    const [owner, repo] = name.split("/");
    return { repoRef: { owner, repo }, framed, recent };
  };

  const SYMBOL = "data:image/svg+xml;base64,c3ltYm9sZQ==";
  /** Les dépôts dont l'identité a été demandée, et ceux qui en ont une. */
  let requests: string[];
  let withSymbol: string[];
  let rereads: number;

  async function mountView(repos: KnownRepo[]): Promise<HTMLElement> {
    requests = [];
    rereads = 0;
    provide(KnownReposService, {
      repos: signal(repos),
      inProgress: signal(false),
      error: signal(null),
      refresh: async () => {},
    });
    provide(ProjectIdentityService, {
      generation: signal(0),
      findSymbol: (d: RepoRef) => (withSymbol.includes(d.repo) ? SYMBOL : null),
      request: async (d: RepoRef) => void requests.push(`${d.owner}/${d.repo}`),
      reread: () => void rereads++,
    });
    const router = createAppRouter(createMemoryHistory());
    await router.push("/");
    await router.isReady();
    const view = mount(HomePage, { global: { plugins: [router] } });
    await flushPromises();
    return view.element as HTMLElement;
  }

  beforeEach(() => {
    withSymbol = [];
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

  const texts = (root: Element, selector: string) =>
    [...root.querySelectorAll(selector)].map((e) => e.textContent?.trim());

  it("présente les référentiels groupés par organisation", async () => {
    const page = await mountView([
      known("ssk-it/skift-cadrage", true, true),
      known("Wayne-Corp/wayne-devis-cadrage", true),
      known("ssk-it/mnesisk-cadrage", true),
      known("ssk-it/skift", false),
    ]);

    const main = page.querySelector(".cadres")!;
    expect(texts(main, ".organisation h2")).toEqual(["ssk-it", "Wayne-Corp"]);
    expect(texts(main, ".organisation:first-child .nom")).toEqual([
      "mnesisk-cadrage",
      "skift-cadrage",
    ]);
  });

  it("montre l’avatar de chaque organisation à côté de son nom", async () => {
    const page = await mountView([
      known("ssk-it/skift-cadrage", true),
      known("Wayne-Corp/wayne-devis-cadrage", true),
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
    withSymbol = ["skift-cadrage"];
    const page = await mountView([
      known("ssk-it/skift-cadrage", true),
      known("ssk-it/mnesisk-cadrage", true),
    ]);

    const [mnesisk, skift] = [...page.querySelectorAll(".cadres .depot")];
    expect(skift.querySelector("img.symbole")?.getAttribute("src")).toBe(
      SYMBOL,
    );
    expect(skift.querySelector(".material-symbols-outlined")).toBeNull();
    expect(mnesisk.querySelector("img.symbole")).toBeNull();
    expect(
      mnesisk.querySelector(".material-symbols-outlined")?.textContent?.trim(),
    ).toBe("folder");
  });

  it("redemande les identités à chaque retour, sans en lire pour les dépôts sans référentiel", async () => {
    withSymbol = [];
    await mountView([
      known("ssk-it/skift-cadrage", true),
      known("ssk-it/skift", false),
    ]);

    expect(rereads).toBe(1);
    // L'identité vit dans le référentiel : un dépôt qui n'en porte pas n'a rien à montrer, et le lire coûterait un appel par dépôt de code.
    expect(requests).toEqual(["ssk-it/skift-cadrage"]);
  });

  it("groupe aussi les dépôts sans référentiel, toujours repliés", async () => {
    const page = await mountView([
      known("ssk-it/skift-cadrage", true),
      known("ssk-it/skift", false),
      known("Globex/site", false),
    ]);

    const others = page.querySelector("details.autres")!;
    expect(others.hasAttribute("open")).toBe(false);
    expect(texts(others, "summary")).toEqual(["Autres dépôts autorisés (2)"]);
    expect(texts(others, ".organisation h2")).toEqual(["Globex", "ssk-it"]);
  });

  /** RG-connexion-optionnelle, RG-modes-acces : l'aide se propose sans se poser en préalable. */
  it("propose la connexion, facultative, avec la façon de créer un jeton, tant qu’aucun accès n’est en place", async () => {
    const page = await mountView([known("ssk-it/skift-cadrage", true, true)]);

    const signInBlock = page.querySelector(".connexion")!;
    expect(signInBlock.querySelector("h2")?.textContent).toContain(
      "facultative",
    );
    expect(signInBlock.textContent).toContain("dépôts publics se lisent sans");
    expect(signInBlock.querySelector(".aide-jeton h3")?.textContent).toBe(
      "Créer un jeton",
    );
    expect(
      signInBlock.querySelector(
        'a[href="https://github.com/settings/personal-access-tokens/new"]',
      ),
    ).not.toBeNull();
  });

  /** RG-acces-par-portee : un jeton d'une autre organisation que le dernier projet ouvert reste un accès en place. */
  it("ne la propose plus dès qu’un jeton est enregistré, quelle qu’en soit la portée", async () => {
    inject(TokenService).setForScope(
      "wayne-corp",
      "ghp_abcdefghijklmnopqrst1234",
    );
    const page = await mountView([known("ssk-it/skift-cadrage", true, true)]);

    expect(page.querySelector(".connexion")).toBeNull();
  });

  it("ouvre la connexion, assez large pour l’aide, depuis l’accueil", async () => {
    const page = await mountView([]);

    (page.querySelector(".connexion .ui-bouton") as HTMLElement).click();

    const dialog = inject(DialogService);
    await vi.waitFor(() => expect(dialog.openDialogs()).toHaveLength(1));
    expect(dialog.openDialogs()[0].options.width).toBe("680px");
    expect(dialog.openDialogs()[0].options.maxWidth).toBe("calc(100vw - 32px)");
  });
});
