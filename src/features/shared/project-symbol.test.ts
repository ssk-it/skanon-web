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
 * RG-identite-affichee: the symbol of the theme actually applied, as an image only, then the avatar or the folder icon, in the same place.
 *
 * `pc-symbole-projet` and `pc-avatar-organisation`, the Angular hosts, are here the `.symbole-projet` and `.avatar-organisation` roots; `mat-icon`, `UiIcon`'s `.material-symbols-outlined`.
 */
describe("a project's symbol", () => {
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
    // SSK Canon's host: a container where the symbol is placed.
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

  it("shows the forced theme's variant, and follows it when it changes", async () => {
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

  it("never inserts it into the document: an image, with no text to read", async () => {
    const { root: root } = mountView();
    sources.set({ clair: PLAIN, sombre: PLAIN });
    await nextTick();

    expect(root.querySelector(".symbole-projet svg")).toBeNull();
    const image = root.querySelector("img.symbole")!;
    // The project name is written next to it: the symbol does not repeat it.
    expect(image.getAttribute("alt")).toBe("");
  });

  it("falls back to the organisation's avatar without a symbol", () => {
    const { root: root } = mountView("avatar");
    expect(root.querySelector("img.symbole")).toBeNull();
    expect(root.querySelector(".avatar-organisation")).not.toBeNull();
  });

  it("falls back to the folder icon, on the home page", () => {
    const { root: root } = mountView("folder");
    expect(root.querySelector(".avatar-organisation")).toBeNull();
    expect(
      root.querySelector(".material-symbols-outlined")?.textContent?.trim(),
    ).toBe("folder");
  });

  it("falls back to its fallback when the image cannot be read", async () => {
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

  it("shows nothing without a symbol when no fallback is wanted", () => {
    const { root: root } = mountView("aucun");
    const host = root.querySelector(".symbole-projet")!;
    expect(host.children).toHaveLength(0);
    // The space is not reserved: it did not exist before the symbol.
    expect(host.classList).toContain("vide");
  });

  it("takes the variant of an imposed background, whatever the theme", async () => {
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
