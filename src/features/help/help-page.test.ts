import { flushPromises, mount } from "@vue/test-utils";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { createMemoryHistory } from "vue-router";
import { provideHttpTesting } from "../../core/http/http-testing";
import { inject, provide } from "../../core/injection";
import { TokenService } from "../../core/github/token.service";
import { COMPOSITION, compose } from "../../extension/composer";
import type { Extension } from "../../extension/extension";
import { PLATFORM } from "../../platform/platform-token";
import { createWebPlatform } from "../../platform/web";
import { createAppRouter } from "../../router";

/**
 * L'aide est une annonce : elle dit ce que l'application fait de ce qu'on lui confie, cible par cible, et ne promet rien qu'elle ne tienne (RG-aide-fidele, RG-secret-conserve-localement).
 */
describe("page « Fonctionnement de Skanon »", () => {
  beforeEach(() => {
    provideHttpTesting();
  });

  async function mountView(
    target: "web" | "bureau",
    extensions: readonly Extension[] = [],
  ): Promise<string> {
    provide(PLATFORM, { ...createWebPlatform(), target });
    provide(COMPOSITION, compose(extensions));
    const router = createAppRouter(createMemoryHistory());
    await router.push("/aide");
    await router.isReady();
    const { RouterView } = await import("vue-router");
    const view = mount(RouterView, { global: { plugins: [router] } });
    await flushPromises();
    return view.text();
  }

  it("a sa propre adresse, hors de tout projet", async () => {
    const router = createAppRouter(createMemoryHistory());
    await router.push("/aide");
    expect(router.currentRoute.value.path).toBe("/aide");
  });

  it("couvre les quatre sujets", async () => {
    const text = await mountView("web");
    for (const title of [
      "Jetons",
      "Mise en cache",
      "Découverte des projets",
      "Communications extérieures",
    ])
      expect(text).toContain(title);
  });

  it("dit, dans le navigateur, que le jeton y est gardé en clair", async () => {
    const text = await mountView("web");
    expect(text).toContain("gardé dans ce navigateur, en clair");
    expect(text).not.toContain("coffre du système");
  });

  it("propose, dans le navigateur, de protéger le jeton par une passkey, et dit qu’un projet peut l’exiger", async () => {
    const text = await mountView("web");
    expect(text).toContain("protégé par une passkey");
    expect(text).toContain("Un projet peut exiger");
  });

  it("dit des jetons scellés que le navigateur n’en garde que le chiffré, sans rien promettre contre la page", async () => {
    vi.spyOn(inject(TokenService), "form").mockReturnValue("scelle");
    const text = await mountView("web");
    expect(text).toContain("n’en garde que le chiffré");
    expect(text).toContain("script");
    expect(text).not.toContain("gardé dans ce navigateur, en clair");
    expect(text).toContain("sous la même clé que les jetons");
  });

  it("dit, sur le bureau, que le jeton est dans le coffre du système", async () => {
    const text = await mountView("bureau");
    expect(text).toContain("rangé dans le coffre du système");
    expect(text).not.toContain("gardé dans ce navigateur");
  });

  it("nomme chaque hôte que tout livrable contacte", async () => {
    const text = await mountView("web");
    for (const host of [
      "api.github.com",
      "raw.githubusercontent.com",
      "avatars.githubusercontent.com",
    ])
      expect(text).toContain(host);
  });

  // ADR-extensions-commerciales : ce qui tient au livrable vient de son extension, la page ne sait pas ce qu'elle rend.
  it("dit, dans chaque section, ce que le livrable apporte", async () => {
    const text = await mountView("web", [
      {
        id: "factice",
        pages: {
          help: {
            jetons: ["Phrase apportée aux jetons."],
            cache: ["Phrase apportée au cache."],
            communications: ["Hôte apporté."],
          },
        },
      },
    ]);
    expect(text).toContain("Phrase apportée aux jetons.");
    expect(text).toContain("Phrase apportée au cache.");
    expect(text).toContain("Hôte apporté.");
  });

  it("place l'hôte apporté avant ce qu'aucun livrable ne contacte", async () => {
    const text = await mountView("web", [
      { id: "factice", pages: { help: { communications: ["Hôte apporté."] } } },
    ]);
    expect(text.indexOf("Hôte apporté.")).toBeGreaterThan(-1);
    expect(text.indexOf("Hôte apporté.")).toBeLessThan(
      text.indexOf("Aucune mesure d’audience"),
    );
  });
});
