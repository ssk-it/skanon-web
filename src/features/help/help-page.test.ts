import { flushPromises, mount } from "@vue/test-utils";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { createMemoryHistory } from "vue-router";
import { provideHttpTesting } from "../../core/http/http-testing";
import { inject, provide } from "../../core/injection";
import { TokenService } from "../../core/github/token.service";
import { LocaleService } from "../../core/i18n/locale.service";
import { COMPOSITION, compose } from "../../extension/composer";
import type { Extension } from "../../extension/extension";
import { PLATFORM } from "../../platform/platform-token";
import { createWebPlatform } from "../../platform/web";
import { createAppRouter } from "../../router";

/**
 * The help is a statement: it says what the application does with what it is entrusted with, target by target, and promises nothing it does not keep (RG-aide-fidele, RG-secret-conserve-localement).
 */
describe("« Fonctionnement de Skanon » page", () => {
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

  it("has its own address, outside any project", async () => {
    const router = createAppRouter(createMemoryHistory());
    await router.push("/aide");
    expect(router.currentRoute.value.path).toBe("/aide");
  });

  it("covers the four topics", async () => {
    const text = await mountView("web");
    for (const title of [
      "Jetons",
      "Mise en cache",
      "Découverte des projets",
      "Communications extérieures",
    ])
      expect(text).toContain(title);
  });

  it("says, in the browser, that the token is kept there in clear", async () => {
    const text = await mountView("web");
    expect(text).toContain("gardé dans ce navigateur, en clair");
    expect(text).not.toContain("coffre du système");
  });

  it("offers, in the browser, to protect the token with a passkey, and says a project may require it", async () => {
    const text = await mountView("web");
    expect(text).toContain("protégé par une passkey");
    expect(text).toContain("Un projet peut exiger");
  });

  it("says of sealed tokens that the browser keeps only their ciphertext, without promising anything against the page", async () => {
    vi.spyOn(inject(TokenService), "form").mockReturnValue("scelle");
    const text = await mountView("web");
    expect(text).toContain("n’en garde que le chiffré");
    expect(text).toContain("script");
    expect(text).not.toContain("gardé dans ce navigateur, en clair");
    expect(text).toContain("sous la même clé que les jetons");
  });

  // 2026-065: one unlock while a Skanon tab stays open, offered by the browser's autofill, and the author's preference.
  it("says sealed tokens open once while a tab stays open, and what a script can then read", async () => {
    vi.spyOn(inject(TokenService), "form").mockReturnValue("scelle");
    const text = await mountView("web");
    expect(text).toContain(
      "une fois, tant qu’un onglet de Skanon reste ouvert",
    );
    expect(text).toContain("clé d’accès enregistrée");
    expect(text).not.toContain("chaque onglet");
    expect(text).toContain(
      "Dans ce navigateur, vous pouvez vous passer de la passkey",
    );
  });

  it("says the author may do without the passkey where their project leaves the choice", async () => {
    const text = await mountView("web");
    expect(text).toContain(
      "Dans ce navigateur, vous pouvez vous passer de la passkey",
    );
    expect(text).not.toContain("chaque onglet");
  });

  it("says, on the desktop, that the token is in the system keychain", async () => {
    const text = await mountView("bureau");
    expect(text).toContain("rangé dans le coffre du système");
    expect(text).not.toContain("gardé dans ce navigateur");
  });

  it("names every host that every deliverable contacts", async () => {
    const text = await mountView("web");
    for (const host of [
      "api.github.com",
      "raw.githubusercontent.com",
      "avatars.githubusercontent.com",
    ])
      expect(text).toContain(host);
  });

  // ADR-extensions-commerciales: what belongs to the deliverable comes from its extension; the page does not know what it renders.
  it("says, in each section, what the deliverable brings", async () => {
    const text = await mountView("web", [
      {
        id: "factice",
        pages: {
          help: {
            jetons: [
              { fr: "Phrase apportée aux jetons.", en: "Phrase for tokens." },
            ],
            cache: [
              { fr: "Phrase apportée au cache.", en: "Phrase for cache." },
            ],
            communications: [{ fr: "Hôte apporté.", en: "Brought host." }],
          },
        },
      },
    ]);
    expect(text).toContain("Phrase apportée aux jetons.");
    expect(text).toContain("Phrase apportée au cache.");
    expect(text).toContain("Hôte apporté.");
  });

  it("places the brought host before what no deliverable contacts", async () => {
    const text = await mountView("web", [
      {
        id: "factice",
        pages: {
          help: {
            communications: [{ fr: "Hôte apporté.", en: "Brought host." }],
          },
        },
      },
    ]);
    expect(text.indexOf("Hôte apporté.")).toBeGreaterThan(-1);
    expect(text.indexOf("Hôte apporté.")).toBeLessThan(
      text.indexOf("Aucune mesure d’audience"),
    );
  });

  // RG-aide-fidele, RG-textes-traduits: the statement holds in each language, the deliverable's phrases included.
  describe("in English", () => {
    beforeEach(() => inject(LocaleService).choice.set("en"));

    it("covers the four topics, in English only", async () => {
      const text = await mountView("web");
      for (const title of [
        "How Skanon works",
        "Tokens",
        "Caching",
        "Project discovery",
        "External communications",
      ])
        expect(text).toContain(title);
      for (const title of [
        "Fonctionnement de Skanon",
        "Jetons",
        "Mise en cache",
      ])
        expect(text).not.toContain(title);
    });

    it("says, in the browser, that the token is kept there in clear, and names the hosts", async () => {
      const text = await mountView("web");
      expect(text).toContain("kept in this browser, in clear");
      expect(text).toContain("A project may require this protection");
      for (const host of [
        "api.github.com",
        "raw.githubusercontent.com",
        "avatars.githubusercontent.com",
      ])
        expect(text).toContain(host);
    });

    it("says of sealed tokens that the browser keeps only their ciphertext", async () => {
      vi.spyOn(inject(TokenService), "form").mockReturnValue("scelle");
      const text = await mountView("web");
      expect(text).toContain("keeps only their ciphertext");
      expect(text).toContain("under the same key as the tokens");
    });

    it("says, on the desktop, that the token is in the system keychain", async () => {
      const text = await mountView("bureau");
      expect(text).toContain("stored in the system vault");
      expect(text).not.toContain("kept in this browser");
    });

    it("renders the deliverable's phrases in English", async () => {
      const text = await mountView("web", [
        {
          id: "factice",
          pages: {
            help: {
              jetons: [
                { fr: "Phrase apportée aux jetons.", en: "Phrase for tokens." },
              ],
              cache: [
                { fr: "Phrase apportée au cache.", en: "Phrase for cache." },
              ],
              communications: [{ fr: "Hôte apporté.", en: "Brought host." }],
            },
          },
        },
      ]);
      expect(text).toContain("Phrase for tokens.");
      expect(text).toContain("Phrase for cache.");
      expect(text).toContain("Brought host.");
      expect(text).not.toContain("Hôte apporté.");
    });
  });
});
