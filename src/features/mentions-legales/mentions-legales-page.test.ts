import { flushPromises, mount, type VueWrapper } from "@vue/test-utils";
import { beforeEach, describe, expect, it } from "vitest";
import { createMemoryHistory } from "vue-router";
import { provideHttpTesting } from "../../core/http/http-testing";
import { provide } from "../../core/injection";
import { COMPOSITION, composer } from "../../extension/composer";
import type { Extension } from "../../extension/extension";
import { createRouteur } from "../../routeur";

/**
 * Les mentions légales de l'éditeur, celles de https://www.ssk-it.fr/mentions-legales/. Comme l'aide, elles ne disent que ce qui vaut pour la cible où l'on se trouve (2026-054, décision 03) : l'hébergeur n'a de sens que pour la version web.
 */
describe("page « Mentions légales »", () => {
  beforeEach(() => {
    provideHttpTesting();
  });

  async function monter(
    extensions: readonly Extension[] = [],
  ): Promise<string> {
    return (await monterPage(extensions)).text();
  }

  async function monterPage(
    extensions: readonly Extension[] = [],
  ): Promise<VueWrapper> {
    provide(COMPOSITION, composer(extensions));
    const routeur = createRouteur(createMemoryHistory());
    await routeur.push("/mentions-legales");
    await routeur.isReady();
    const { RouterView } = await import("vue-router");
    const vue = mount(RouterView, { global: { plugins: [routeur] } });
    await flushPromises();
    return vue;
  }

  it("a sa propre adresse, hors de tout projet", async () => {
    const routeur = createRouteur(createMemoryHistory());
    await routeur.push("/mentions-legales");
    expect(routeur.currentRoute.value.path).toBe("/mentions-legales");
    expect(routeur.currentRoute.value.meta["title"]).toBe(
      "Mentions légales — Skanon",
    );
  });

  it("nomme l’éditeur et ses identifiants", async () => {
    const texte = await monter();
    for (const mention of [
      "Sébastien Skorupski",
      "Auto-entrepreneur",
      "554 rue Mathieu Pichon",
      "43330 Saint-Ferréol-d’Auroure, France",
      "511 992 406 00047",
      "FR 78511992406",
    ])
      expect(texte).toContain(mention);
  });

  it("donne l’adresse de contact sans l’écrire en entier dans la page", async () => {
    const texte = await monter();
    expect(texte).toContain("skanon");
    expect(texte).not.toContain("sebastien.skorupski");
    expect(texte).not.toContain("@");
  });

  // ADR-extensions-commerciales : l'hébergeur, les données et la licence propres au livrable viennent de son extension.
  it("dit ce que le livrable apporte : son hébergeur, ses données, sa licence", async () => {
    const texte = await monter([
      {
        id: "factice",
        pages: {
          mentions: {
            hebergeur: "Un hébergeur apporté.",
            donnees: ["Une donnée apportée."],
            propriete: ["Une licence apportée."],
          },
        },
      },
    ]);
    expect(texte).toContain("Un hébergeur apporté.");
    expect(texte).toContain("Une donnée apportée.");
    expect(texte).toContain("Une licence apportée.");
  });

  it("ne nomme aucun hébergeur que le livrable n'apporte pas", async () => {
    expect(await monter()).not.toContain("SCALEWAY");
  });

  // RG-mentions-legales : la propriété intellectuelle dit la licence de chaque partie ; ce qui vaut pour toutes n'en choisit aucune.
  it("ne prête à aucune partie une licence qu'elle n'apporte pas", async () => {
    const texte = await monter();
    expect(texte).toContain(
      "Les droits d’auteur sur Skanon appartiennent à Sébastien Skorupski",
    );
    expect(texte).not.toContain("propriété exclusive");
    expect(texte).not.toContain("FSL");
  });

  it("rend en lien l'adresse qu'une phrase apportée désigne", async () => {
    const page = await monterPage([
      {
        id: "factice",
        pages: {
          mentions: {
            propriete: [
              {
                avant: "Ses sources sont sur ",
                lien: {
                  libelle: "le dépôt",
                  href: "https://exemple.test/depot",
                },
                apres: ".",
              },
            ],
          },
        },
      },
    ]);
    expect(page.text()).toContain("Ses sources sont sur le dépôt.");
    expect(page.get('a[href="https://exemple.test/depot"]').text()).toBe(
      "le dépôt",
    );
  });
});
