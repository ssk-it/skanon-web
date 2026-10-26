import { flushPromises, mount } from "@vue/test-utils";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { createMemoryHistory } from "vue-router";
import type { RepoRef } from "../../core/github/github-client";
import { TokenService } from "../../core/github/token.service";
import { inject, provide, resetInjection } from "../../core/injection";
import {
  KnownReposService,
  type KnownRepo,
} from "../../core/repo/known-repos.service";
import { ProjectIdentityService } from "../../core/repo/project-identity.service";
import { signal } from "../../core/signals";
import { createAppRouter } from "../../router";
import { DialogService } from "../../ui/dialog.service";
import HomePage from "./HomePage.vue";

/**
 * Once every specification is recognised, the list holds several dozen, from several organisations: without grouping, one searches for one's own line by line.
 */
describe("« Ouvrir un projet » screen", () => {
  const known = (name: string, framed: boolean, recent = false): KnownRepo => {
    const [owner, repo] = name.split("/");
    return { repoRef: { owner, repo }, framed, recent };
  };

  const SYMBOL = "data:image/svg+xml;base64,c3ltYm9sZQ==";
  /** The repos whose identity was requested, and those that have one. */
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

  it("shows specifications grouped by organisation", async () => {
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

  it("shows each organisation's avatar next to its name", async () => {
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
  it("shows a project's symbol in place of the folder, and the folder without a symbol", async () => {
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

  it("asks for identities again on each return, without reading any for repos without a specification", async () => {
    withSymbol = [];
    await mountView([
      known("ssk-it/skift-cadrage", true),
      known("ssk-it/skift", false),
    ]);

    expect(rereads).toBe(1);
    // The identity lives in the specification: a repo that carries none has nothing to show, and reading it would cost one call per code repo.
    expect(requests).toEqual(["ssk-it/skift-cadrage"]);
  });

  it("also groups repos without a specification, always collapsed", async () => {
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

  /** RG-connexion-optionnelle, RG-modes-acces: the help offers itself without posing as a prerequisite. */
  it("offers sign-in, optional, with how to create a token, as long as no access is in place", async () => {
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

  /** RG-acces-par-portee: a token for another organisation than the last opened project remains an access in place. */
  it("no longer offers it once a token is saved, whatever its scope", async () => {
    inject(TokenService).setForScope(
      "wayne-corp",
      "ghp_abcdefghijklmnopqrst1234",
    );
    const page = await mountView([known("ssk-it/skift-cadrage", true, true)]);

    expect(page.querySelector(".connexion")).toBeNull();
  });

  it("opens sign-in, wide enough for the help, from the home page", async () => {
    const page = await mountView([]);

    (page.querySelector(".connexion .ui-bouton") as HTMLElement).click();

    const dialog = inject(DialogService);
    await vi.waitFor(() => expect(dialog.openDialogs()).toHaveLength(1));
    expect(dialog.openDialogs()[0].options.width).toBe("680px");
    expect(dialog.openDialogs()[0].options.maxWidth).toBe("calc(100vw - 32px)");
  });
});
