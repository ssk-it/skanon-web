import { mount } from "@vue/test-utils";
import { describe, expect, it } from "vitest";
import { nextTick } from "vue";
import { inject, provide } from "../../core/injection";
import type { IdentityVariant } from "../../core/repo/identity-names";
import { ProjectIdentityService } from "../../core/repo/project-identity.service";
import { signal, type WritableSignal } from "../../core/signals";
import { ThemeService } from "../../core/ui/theme.service";
import ProjectSymbol from "./ProjectSymbol.vue";

/**
 * RG-identite-affichee : le symbole du thème réellement appliqué, en image seulement, puis l'avatar ou l'icône de dossier, à la même place.
 *
 * `pc-symbole-projet` et `pc-avatar-organisation`, les hôtes Angular, sont ici les racines `.symbole-projet` et `.avatar-organisation` ; `mat-icon`, la `.material-symbols-outlined` de `UiIcone`.
 */
describe("symbole d’un projet", () => {
  const PLAIN = "data:image/svg+xml;base64,Y2xhaXI=";
  const DARK = "data:image/svg+xml;base64,c29tYnJl";

  let sources: WritableSignal<Partial<Record<IdentityVariant, string>>>;
  let requests: IdentityVariant[];

  function mountView(
    fallback: "avatar" | "folder" | "aucun" = "avatar",
    background: IdentityVariant | null = null,
  ) {
    Object.defineProperty(globalThis, "localStorage", {
      configurable: true,
      value: {
        getItem: () => null,
        setItem: () => {},
        removeItem: () => {},
        clear: () => {},
      },
    });
    sources = signal({});
    requests = [];
    provide(ProjectIdentityService, {
      generation: signal(0),
      findSymbol: (_: unknown, v: IdentityVariant) => sources()[v] ?? null,
      request: async (_: unknown, v: IdentityVariant) => void requests.push(v),
    });
    // L'hôte de SSK Canon : un conteneur où le symbole est posé.
    const root = document.createElement("div");
    mount(ProjectSymbol, {
      props: {
        repoRef: { owner: "org", repo: "projet" },
        fallback: fallback,
        background: background,
      },
      attachTo: root,
    });
    return { root: root };
  }

  it("montre la variante du thème forcé, et la suit quand il change", async () => {
    const { root: root } = mountView();
    const theme = inject(ThemeService);
    sources.set({ clair: PLAIN, sombre: DARK });

    theme.theme.set("sombre");
    await nextTick();
    expect(
      root.querySelector<HTMLImageElement>("img.symbole")?.getAttribute("src"),
    ).toBe(DARK);
    expect(requests).toContain("sombre");

    theme.theme.set("clair");
    await nextTick();
    expect(
      root.querySelector<HTMLImageElement>("img.symbole")?.getAttribute("src"),
    ).toBe(PLAIN);
  });

  it("ne l’insère jamais dans le document : une image, sans texte à lire", async () => {
    const { root: root } = mountView();
    sources.set({ clair: PLAIN, sombre: PLAIN });
    await nextTick();

    expect(root.querySelector(".symbole-projet svg")).toBeNull();
    const image = root.querySelector("img.symbole")!;
    // Le nom du projet est écrit à côté : le symbole ne le répète pas.
    expect(image.getAttribute("alt")).toBe("");
  });

  it("retombe sur l’avatar de l’organisation sans symbole", () => {
    const { root: root } = mountView("avatar");
    expect(root.querySelector("img.symbole")).toBeNull();
    expect(root.querySelector(".avatar-organisation")).not.toBeNull();
  });

  it("retombe sur l’icône de dossier, sur l’accueil", () => {
    const { root: root } = mountView("folder");
    expect(root.querySelector(".avatar-organisation")).toBeNull();
    expect(
      root.querySelector(".material-symbols-outlined")?.textContent?.trim(),
    ).toBe("folder");
  });

  it("retombe sur son repli quand l’image ne se lit pas", async () => {
    const { root: root } = mountView("folder");
    sources.set({ clair: PLAIN, sombre: PLAIN });
    await nextTick();

    root.querySelector("img.symbole")!.dispatchEvent(new Event("error"));
    await nextTick();
    expect(root.querySelector("img.symbole")).toBeNull();
    expect(
      root.querySelector(".material-symbols-outlined")?.textContent?.trim(),
    ).toBe("folder");
  });

  it("ne montre rien sans symbole quand aucun repli n’est voulu", () => {
    const { root: root } = mountView("aucun");
    const host = root.querySelector(".symbole-projet")!;
    expect(host.children).toHaveLength(0);
    // La place ne se réserve pas : elle n'existait pas avant le symbole.
    expect(host.classList).toContain("vide");
  });

  it("prend la variante d’un fond imposé, quel que soit le thème", async () => {
    const { root: root } = mountView("aucun", "sombre");
    inject(ThemeService).theme.set("clair");
    sources.set({ clair: PLAIN, sombre: DARK });
    await nextTick();

    expect(root.querySelector("img.symbole")?.getAttribute("src")).toBe(DARK);
    expect(requests).toEqual(["sombre"]);
    expect(root.querySelector(".symbole-projet")!.classList).not.toContain(
      "vide",
    );
  });
});
