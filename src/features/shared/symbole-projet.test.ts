import { mount } from "@vue/test-utils";
import { describe, expect, it } from "vitest";
import { nextTick } from "vue";
import { inject, provide } from "../../core/injection";
import type { VarianteIdentite } from "../../core/repo/identite-noms";
import { IdentitesService } from "../../core/repo/identites.service";
import { signal, type WritableSignal } from "../../core/signaux";
import { ThemeService } from "../../core/ui/theme.service";
import SymboleProjet from "./SymboleProjet.vue";

/**
 * RG-identite-affichee : le symbole du thème réellement appliqué, en image seulement, puis l'avatar ou l'icône de dossier, à la même place.
 *
 * `pc-symbole-projet` et `pc-avatar-organisation`, les hôtes Angular, sont ici les racines `.symbole-projet` et `.avatar-organisation` ; `mat-icon`, la `.material-symbols-outlined` de `UiIcone`.
 */
describe("symbole d’un projet", () => {
  const CLAIR = "data:image/svg+xml;base64,Y2xhaXI=";
  const SOMBRE = "data:image/svg+xml;base64,c29tYnJl";

  let sources: WritableSignal<Partial<Record<VarianteIdentite, string>>>;
  let demandes: VarianteIdentite[];

  function monter(
    repli: "avatar" | "folder" | "aucun" = "avatar",
    fond: VarianteIdentite | null = null,
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
    demandes = [];
    provide(IdentitesService, {
      generation: signal(0),
      findSymbole: (_: unknown, v: VarianteIdentite) => sources()[v] ?? null,
      demander: async (_: unknown, v: VarianteIdentite) =>
        void demandes.push(v),
    });
    // L'hôte de SSK Canon : un conteneur où le symbole est posé.
    const racine = document.createElement("div");
    mount(SymboleProjet, {
      props: { depot: { owner: "org", repo: "projet" }, repli, fond },
      attachTo: racine,
    });
    return { racine };
  }

  it("montre la variante du thème forcé, et la suit quand il change", async () => {
    const { racine } = monter();
    const theme = inject(ThemeService);
    sources.set({ clair: CLAIR, sombre: SOMBRE });

    theme.theme.set("sombre");
    await nextTick();
    expect(
      racine
        .querySelector<HTMLImageElement>("img.symbole")
        ?.getAttribute("src"),
    ).toBe(SOMBRE);
    expect(demandes).toContain("sombre");

    theme.theme.set("clair");
    await nextTick();
    expect(
      racine
        .querySelector<HTMLImageElement>("img.symbole")
        ?.getAttribute("src"),
    ).toBe(CLAIR);
  });

  it("ne l’insère jamais dans le document : une image, sans texte à lire", async () => {
    const { racine } = monter();
    sources.set({ clair: CLAIR, sombre: CLAIR });
    await nextTick();

    expect(racine.querySelector(".symbole-projet svg")).toBeNull();
    const image = racine.querySelector("img.symbole")!;
    // Le nom du projet est écrit à côté : le symbole ne le répète pas.
    expect(image.getAttribute("alt")).toBe("");
  });

  it("retombe sur l’avatar de l’organisation sans symbole", () => {
    const { racine } = monter("avatar");
    expect(racine.querySelector("img.symbole")).toBeNull();
    expect(racine.querySelector(".avatar-organisation")).not.toBeNull();
  });

  it("retombe sur l’icône de dossier, sur l’accueil", () => {
    const { racine } = monter("folder");
    expect(racine.querySelector(".avatar-organisation")).toBeNull();
    expect(
      racine.querySelector(".material-symbols-outlined")?.textContent?.trim(),
    ).toBe("folder");
  });

  it("retombe sur son repli quand l’image ne se lit pas", async () => {
    const { racine } = monter("folder");
    sources.set({ clair: CLAIR, sombre: CLAIR });
    await nextTick();

    racine.querySelector("img.symbole")!.dispatchEvent(new Event("error"));
    await nextTick();
    expect(racine.querySelector("img.symbole")).toBeNull();
    expect(
      racine.querySelector(".material-symbols-outlined")?.textContent?.trim(),
    ).toBe("folder");
  });

  it("ne montre rien sans symbole quand aucun repli n’est voulu", () => {
    const { racine } = monter("aucun");
    const hote = racine.querySelector(".symbole-projet")!;
    expect(hote.children).toHaveLength(0);
    // La place ne se réserve pas : elle n'existait pas avant le symbole.
    expect(hote.classList).toContain("vide");
  });

  it("prend la variante d’un fond imposé, quel que soit le thème", async () => {
    const { racine } = monter("aucun", "sombre");
    inject(ThemeService).theme.set("clair");
    sources.set({ clair: CLAIR, sombre: SOMBRE });
    await nextTick();

    expect(racine.querySelector("img.symbole")?.getAttribute("src")).toBe(
      SOMBRE,
    );
    expect(demandes).toEqual(["sombre"]);
    expect(racine.querySelector(".symbole-projet")!.classList).not.toContain(
      "vide",
    );
  });
});
