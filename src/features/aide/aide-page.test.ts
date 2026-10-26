import { flushPromises, mount } from "@vue/test-utils";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { createMemoryHistory } from "vue-router";
import { provideHttpTesting } from "../../core/http/http-testing";
import { inject, provide } from "../../core/injection";
import { TokenService } from "../../core/github/token.service";
import { COMPOSITION, composer } from "../../extension/composer";
import type { Extension } from "../../extension/extension";
import { PLATEFORME } from "../../plateforme/jeton";
import { createPlateformeWeb } from "../../plateforme/web";
import { createRouteur } from "../../routeur";

/**
 * L'aide est une annonce : elle dit ce que l'application fait de ce qu'on lui confie, cible par cible, et ne promet rien qu'elle ne tienne (RG-aide-fidele, RG-secret-conserve-localement).
 */
describe("page « Fonctionnement de Skanon »", () => {
  beforeEach(() => {
    provideHttpTesting();
  });

  async function monter(
    cible: "web" | "bureau",
    extensions: readonly Extension[] = [],
  ): Promise<string> {
    provide(PLATEFORME, { ...createPlateformeWeb(), cible });
    provide(COMPOSITION, composer(extensions));
    const routeur = createRouteur(createMemoryHistory());
    await routeur.push("/aide");
    await routeur.isReady();
    const { RouterView } = await import("vue-router");
    const vue = mount(RouterView, { global: { plugins: [routeur] } });
    await flushPromises();
    return vue.text();
  }

  it("a sa propre adresse, hors de tout projet", async () => {
    const routeur = createRouteur(createMemoryHistory());
    await routeur.push("/aide");
    expect(routeur.currentRoute.value.path).toBe("/aide");
  });

  it("couvre les quatre sujets", async () => {
    const texte = await monter("web");
    for (const titre of [
      "Jetons",
      "Mise en cache",
      "Découverte des projets",
      "Communications extérieures",
    ])
      expect(texte).toContain(titre);
  });

  it("dit, dans le navigateur, que le jeton y est gardé en clair", async () => {
    const texte = await monter("web");
    expect(texte).toContain("gardé dans ce navigateur, en clair");
    expect(texte).not.toContain("coffre du système");
  });

  it("propose, dans le navigateur, de protéger le jeton par une passkey, et dit qu’un projet peut l’exiger", async () => {
    const texte = await monter("web");
    expect(texte).toContain("protégé par une passkey");
    expect(texte).toContain("Un projet peut exiger");
  });

  it("dit des jetons scellés que le navigateur n’en garde que le chiffré, sans rien promettre contre la page", async () => {
    vi.spyOn(inject(TokenService), "forme").mockReturnValue("scelle");
    const texte = await monter("web");
    expect(texte).toContain("n’en garde que le chiffré");
    expect(texte).toContain("script");
    expect(texte).not.toContain("gardé dans ce navigateur, en clair");
    expect(texte).toContain("sous la même clé que les jetons");
  });

  it("dit, sur le bureau, que le jeton est dans le coffre du système", async () => {
    const texte = await monter("bureau");
    expect(texte).toContain("rangé dans le coffre du système");
    expect(texte).not.toContain("gardé dans ce navigateur");
  });

  it("nomme chaque hôte que tout livrable contacte", async () => {
    const texte = await monter("web");
    for (const hote of [
      "api.github.com",
      "raw.githubusercontent.com",
      "avatars.githubusercontent.com",
    ])
      expect(texte).toContain(hote);
  });

  // ADR-extensions-commerciales : ce qui tient au livrable vient de son extension, la page ne sait pas ce qu'elle rend.
  it("dit, dans chaque section, ce que le livrable apporte", async () => {
    const texte = await monter("web", [
      {
        id: "factice",
        pages: {
          aide: {
            jetons: ["Phrase apportée aux jetons."],
            cache: ["Phrase apportée au cache."],
            communications: ["Hôte apporté."],
          },
        },
      },
    ]);
    expect(texte).toContain("Phrase apportée aux jetons.");
    expect(texte).toContain("Phrase apportée au cache.");
    expect(texte).toContain("Hôte apporté.");
  });

  it("place l'hôte apporté avant ce qu'aucun livrable ne contacte", async () => {
    const texte = await monter("web", [
      { id: "factice", pages: { aide: { communications: ["Hôte apporté."] } } },
    ]);
    expect(texte.indexOf("Hôte apporté.")).toBeGreaterThan(-1);
    expect(texte.indexOf("Hôte apporté.")).toBeLessThan(
      texte.indexOf("Aucune mesure d’audience"),
    );
  });
});
