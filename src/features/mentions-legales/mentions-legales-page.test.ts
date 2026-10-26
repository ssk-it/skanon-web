import { flushPromises, mount, type VueWrapper } from "@vue/test-utils";
import { beforeEach, describe, expect, it } from "vitest";
import { createMemoryHistory } from "vue-router";
import { provideHttpTesting } from "../../core/http/http-testing";
import { provide } from "../../core/injection";
import { COMPOSITION, compose } from "../../extension/composer";
import type { Extension } from "../../extension/extension";
import { createAppRouter } from "../../routeur";

/**
 * Les mentions légales de l'éditeur, celles de https://www.ssk-it.fr/mentions-legales/. Comme l'aide, elles ne disent que ce qui vaut pour la cible où l'on se trouve (2026-054, décision 03) : l'hébergeur n'a de sens que pour la version web.
 */
describe("page « Mentions légales »", () => {
  beforeEach(() => {
    provideHttpTesting();
  });

  async function mountView(
    extensions: readonly Extension[] = [],
  ): Promise<string> {
    return (await mountPage(extensions)).text();
  }

  async function mountPage(
    extensions: readonly Extension[] = [],
  ): Promise<VueWrapper> {
    provide(COMPOSITION, compose(extensions));
    const router = createAppRouter(createMemoryHistory());
    await router.push("/mentions-legales");
    await router.isReady();
    const { RouterView } = await import("vue-router");
    const view = mount(RouterView, { global: { plugins: [router] } });
    await flushPromises();
    return view;
  }

  it("a sa propre adresse, hors de tout projet", async () => {
    const router = createAppRouter(createMemoryHistory());
    await router.push("/mentions-legales");
    expect(router.currentRoute.value.path).toBe("/mentions-legales");
    expect(router.currentRoute.value.meta["title"]).toBe(
      "Mentions légales — Skanon",
    );
  });

  it("nomme l’éditeur et ses identifiants", async () => {
    const text = await mountView();
    for (const notice of [
      "Sébastien Skorupski",
      "Auto-entrepreneur",
      "554 rue Mathieu Pichon",
      "43330 Saint-Ferréol-d’Auroure, France",
      "511 992 406 00047",
      "FR 78511992406",
    ])
      expect(text).toContain(notice);
  });

  it("donne l’adresse de contact sans l’écrire en entier dans la page", async () => {
    const text = await mountView();
    expect(text).toContain("skanon");
    expect(text).not.toContain("sebastien.skorupski");
    expect(text).not.toContain("@");
  });

  // ADR-extensions-commerciales : l'hébergeur, les données et la licence propres au livrable viennent de son extension.
  it("dit ce que le livrable apporte : son hébergeur, ses données, sa licence", async () => {
    const text = await mountView([
      {
        id: "factice",
        pages: {
          legalNotice: {
            host: "Un hébergeur apporté.",
            data: ["Une donnée apportée."],
            ownership: ["Une licence apportée."],
          },
        },
      },
    ]);
    expect(text).toContain("Un hébergeur apporté.");
    expect(text).toContain("Une donnée apportée.");
    expect(text).toContain("Une licence apportée.");
  });

  it("ne nomme aucun hébergeur que le livrable n'apporte pas", async () => {
    expect(await mountView()).not.toContain("SCALEWAY");
  });

  // RG-mentions-legales : la propriété intellectuelle dit la licence de chaque partie ; ce qui vaut pour toutes n'en choisit aucune.
  it("ne prête à aucune partie une licence qu'elle n'apporte pas", async () => {
    const text = await mountView();
    expect(text).toContain(
      "Les droits d’auteur sur Skanon appartiennent à Sébastien Skorupski",
    );
    expect(text).not.toContain("propriété exclusive");
    expect(text).not.toContain("FSL");
  });

  it("rend en lien l'adresse qu'une phrase apportée désigne", async () => {
    const page = await mountPage([
      {
        id: "factice",
        pages: {
          legalNotice: {
            ownership: [
              {
                before: "Ses sources sont sur ",
                link: {
                  label: "le dépôt",
                  href: "https://exemple.test/depot",
                },
                after: ".",
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
