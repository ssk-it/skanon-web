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

  it("places the brought host before what no deliverable contacts", async () => {
    const text = await mountView("web", [
      { id: "factice", pages: { help: { communications: ["Hôte apporté."] } } },
    ]);
    expect(text.indexOf("Hôte apporté.")).toBeGreaterThan(-1);
    expect(text.indexOf("Hôte apporté.")).toBeLessThan(
      text.indexOf("Aucune mesure d’audience"),
    );
  });
});
