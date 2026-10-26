import { flushPromises, mount, type VueWrapper } from "@vue/test-utils";
import { beforeEach, describe, expect, it } from "vitest";
import { createMemoryHistory } from "vue-router";
import { provideHttpTesting } from "../../core/http/http-testing";
import { provide } from "../../core/injection";
import { COMPOSITION, compose } from "../../extension/composer";
import type { Extension } from "../../extension/extension";
import { createAppRouter } from "../../router";

/**
 * The publisher's legal notice, the one at https://www.ssk-it.fr/mentions-legales/. Like the help, it says only what holds for the target one is on (2026-054, decision 03): the host only makes sense for the web version.
 */
describe("« Mentions légales » page", () => {
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

  it("has its own address, outside any project", async () => {
    const router = createAppRouter(createMemoryHistory());
    await router.push("/mentions-legales");
    expect(router.currentRoute.value.path).toBe("/mentions-legales");
    expect(router.currentRoute.value.meta["title"]).toBe(
      "Mentions légales — Skanon",
    );
  });

  it("names the publisher and its identifiers", async () => {
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

  it("gives the contact address without writing it in full in the page", async () => {
    const text = await mountView();
    expect(text).toContain("skanon");
    expect(text).not.toContain("sebastien.skorupski");
    expect(text).not.toContain("@");
  });

  // ADR-extensions-commerciales: the host, the data and the licence specific to the deliverable come from its extension.
  it("says what the deliverable brings: its host, its data, its licence", async () => {
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

  it("names no host the deliverable does not bring", async () => {
    expect(await mountView()).not.toContain("SCALEWAY");
  });

  // RG-mentions-legales: the intellectual property section states the licence of each part; what holds for all of them chooses none.
  it("attributes to no part a licence it does not bring", async () => {
    const text = await mountView();
    expect(text).toContain(
      "Les droits d’auteur sur Skanon appartiennent à Sébastien Skorupski",
    );
    expect(text).not.toContain("propriété exclusive");
    expect(text).not.toContain("FSL");
  });

  it("renders as a link the address a brought sentence designates", async () => {
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
