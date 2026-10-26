import { flushPromises, mount, type VueWrapper } from "@vue/test-utils";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { nextTick } from "vue";
import { createMemoryHistory } from "vue-router";
import App from "./App.vue";
import { signal } from "./core/signals";
import { COMPOSITION, compose } from "./extension/composer";
import { TokenService } from "./core/github/token.service";
import {
  provideHttpTesting,
  type HttpTestingController,
} from "./core/http/http-testing";
import { LocaleService } from "./core/i18n/locale.service";
import { inject, provide } from "./core/injection";
import { SpecificationStore } from "./core/repo/specification.store";
import { RELOAD_PAGE } from "./core/ui/version.service";
import { PLATFORM } from "./platform/platform-token";
import type { VersionAnnouncement } from "./platform/ports";
import { createWebPlatform } from "./platform/web";
import { createAppRouter } from "./router";

/**
 * Loading is triggered by the route guard, not by the bar: the address says which repo to open. These cases therefore target the store, called the way the guard calls it.
 */
describe("Loading the repo", () => {
  let httpMock: HttpTestingController;
  let store: SpecificationStore;

  beforeEach(() => {
    httpMock = provideHttpTesting();
    store = inject(SpecificationStore);
  });

  it("requests the repo tree", async () => {
    void store.loadSpecification({ owner: "ssk-it", repo: "ssk-canon" });

    // a single API call for the tree: contents go through raw, which does not count against the quota
    const query = httpMock.expectOne((r) => r.url.includes("/git/trees/"));
    expect(query.request.url).toContain("recursive=1");
    expect(store.state()).toBe("chargement");
  });

  it("turns ready once the empty tree is received", async () => {
    const pending = store.loadSpecification({
      owner: "ssk-it",
      repo: "ssk-canon",
    });

    httpMock
      .expectOne((r) => r.url.includes("/git/trees/"))
      .flush({ sha: "abc", truncated: false, tree: [] });

    await pending;
    expect(store.state()).toBe("pret");
  });

  it("reports a readable error when the repo cannot be found", async () => {
    const pending = store.loadSpecification({
      owner: "ssk-it",
      repo: "absent",
    });

    httpMock
      .expectOne((r) => r.url.includes("/git/trees/"))
      .flush("Not Found", { status: 404, statusText: "Not Found" });

    await pending;
    expect(store.state()).toBe("erreur");
    // the message must say what to do, not only that it failed
    expect(store.error()).toContain("public");
  });
});

describe("App", () => {
  beforeEach(() => {
    provideHttpTesting();
  });

  it("shows the product name in the bar", async () => {
    const router = createAppRouter(createMemoryHistory());
    await router.push("/");
    await router.isReady();

    const view = mount(App, { global: { plugins: [router] } });
    await flushPromises();

    expect(view.find(".barre").text()).toContain("Skanon");
  });

  // RG-aide-a-portee: help is not a view of a project, its door is everywhere.
  it.each([["/"], ["/ssk-it/ssk-canon/referentiel"]])(
    "leads to help from the bar, on %s",
    async (url) => {
      const router = createAppRouter(createMemoryHistory());
      await router.push(url);
      await router.isReady();

      const view = mount(App, { global: { plugins: [router] } });
      await flushPromises();

      const help = view.find('.barre a[aria-label="Fonctionnement de Skanon"]');
      expect(help.exists()).toBe(true);
      expect(help.attributes("href")).toBe("/aide");
    },
  );

  // The top bar is full (2026-041, 2026-054): what one does not consult while working goes at the bottom.
  it.each([["/"], ["/ssk-it/ssk-canon/referentiel"]])(
    "carries the version and the legal notice at the bottom, on %s",
    async (url) => {
      provide(PLATFORM, {
        ...createWebPlatform(),
        loadVersion: async () => "2026.10.1",
      });
      const router = createAppRouter(createMemoryHistory());
      await router.push(url);
      await router.isReady();

      const view = mount(App, { global: { plugins: [router] } });
      await flushPromises();

      const footer = view.find("footer.pied");
      expect(footer.text()).toContain("Skanon 2026.10.1");
      const legalNotice = footer.find('a[href="/mentions-legales"]');
      expect(legalNotice.text()).toBe("Mentions légales");
    },
  );

  it("omits the version the platform cannot tell", async () => {
    provide(PLATFORM, {
      ...createWebPlatform(),
      loadVersion: () => Promise.reject(new Error("indisponible")),
    });
    const router = createAppRouter(createMemoryHistory());
    await router.push("/");
    await router.isReady();

    const view = mount(App, { global: { plugins: [router] } });
    await flushPromises();

    expect(view.find("footer.pied").text()).not.toContain("Skanon");
    expect(view.find('footer.pied a[href="/mentions-legales"]').exists()).toBe(
      true,
    );
  });
});

/**
 * The version banner — RG-nouvelle-version-proposee, RG-version-perdue-signalee. The platform's announcer is simulated: only its announcements matter here, checking is the service's business.
 */
describe("Version banner", () => {
  let listeners: Set<(a: VersionAnnouncement) => void>;
  let activate: ReturnType<typeof vi.fn>;
  let reload: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    provideHttpTesting();
    listeners = new Set();
    activate = vi.fn(() => Promise.resolve());
    reload = vi.fn();
    provide(PLATFORM, {
      ...createWebPlatform(),
      version: {
        active: true,
        relaunches: false,
        listen: (e: (a: VersionAnnouncement) => void) => {
          listeners.add(e);
          return () => listeners.delete(e);
        },
        listenCause: () => () => {},
        check: () => Promise.resolve(),
        activate: activate,
      },
    });
    provide(RELOAD_PAGE, reload);
  });

  async function mountView(url = "/ssk-it/ssk-canon/referentiel") {
    const router = createAppRouter(createMemoryHistory());
    await router.push(url);
    await router.isReady();
    const view = mount(App, { global: { plugins: [router] } });
    await nextTick();
    return view;
  }

  async function announce(a: VersionAnnouncement = "prete"): Promise<void> {
    for (const e of listeners) e(a);
    await nextTick();
  }

  function banner(view: VueWrapper): HTMLElement | null {
    const found = view.find(".bandeau-version");
    return found.exists() ? (found.element as HTMLElement) : null;
  }

  it("shows nothing while no version is waiting", async () => {
    const view = await mountView();
    expect(banner(view)).toBeNull();
  });

  it("announces the ready version and offers to reload", async () => {
    const view = await mountView();
    await announce();

    const b = banner(view)!;
    expect(b.textContent).toContain("nouvelle version de Skanon est prête");
    expect(b.querySelector("button")?.textContent).toContain("Recharger");
    // nothing is wiped unless the author decided it
    expect(reload).not.toHaveBeenCalled();
  });

  it("reloads on click, after activating the version", async () => {
    const view = await mountView();
    await announce();

    banner(view)!.querySelector("button")!.click();
    await flushPromises();

    expect(activate).toHaveBeenCalledOnce();
    expect(reload).toHaveBeenCalledOnce();
  });

  it("also shows outside a project", async () => {
    const view = await mountView("/");
    await announce();
    expect(banner(view)).not.toBeNull();
  });

  it("warns that unsaved input would be lost", async () => {
    const view = await mountView("/ssk-it/ssk-canon/cadrages/2026-049/editer");
    await announce();
    expect(banner(view)!.textContent).toContain("saisie non enregistrée");
  });

  it("does not mention input on a reading page", async () => {
    const view = await mountView("/ssk-it/ssk-canon/cadrages/2026-049");
    await announce();
    expect(banner(view)!.textContent).not.toContain("saisie");
  });

  it("warns that temporary access will end — RG-acces-temporaire", async () => {
    inject(TokenService).setAccess({
      token: "ghs_temporaire",
      validUntil: new Date(Date.now() + 3_600_000).toISOString(),
      repos: ["ssk-it/ssk-canon"],
      identity: { identifier: "ssk", name: "SSK", email: null },
    });
    const view = await mountView();
    await announce();
    expect(banner(view)!.textContent).toContain("identité vérifiée");
  });

  it("names a lost version, with its own cause", async () => {
    const view = await mountView();
    await announce("perdue");

    const b = banner(view)!;
    expect(b.classList).toContain("perdue");
    expect(b.textContent).toContain("n’est plus entièrement disponible");
    // a cause distinct from the lack of network does not share its text
    expect(b.textContent).not.toContain("prête");
    expect(reload).not.toHaveBeenCalled();

    b.querySelector("button")!.click();
    await flushPromises();
    expect(activate).not.toHaveBeenCalled();
    expect(reload).toHaveBeenCalledOnce();
  });
});

/**
 * The desktop application: the relaunch, the vault that refuses — RG-nouvelle-version-proposee, RG-secret-conserve-localement. The announcer is simulated: the shell's texts and gestures are what matter here. What the desktop application adds is tested in its own repo, with its extensions.
 */
describe("Desktop shell", () => {
  let listeners: Set<(a: VersionAnnouncement) => void>;
  let activate: ReturnType<typeof vi.fn>;
  let reload: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    provideHttpTesting();
    listeners = new Set();
    activate = vi.fn(() => Promise.resolve());
    reload = vi.fn();
    provide(PLATFORM, {
      ...createWebPlatform(),
      target: "bureau",
      version: {
        active: true,
        relaunches: true,
        listen: (e: (a: VersionAnnouncement) => void) => {
          listeners.add(e);
          return () => listeners.delete(e);
        },
        listenCause: () => () => {},
        check: () => Promise.resolve(),
        activate: activate,
      },
    });
    provide(RELOAD_PAGE, reload);
  });

  async function mountView(url = "/ssk-it/ssk-canon/referentiel") {
    const router = createAppRouter(createMemoryHistory());
    await router.push(url);
    await router.isReady();
    const view = mount(App, { global: { plugins: [router] } });
    await nextTick();
    return view;
  }

  async function announce(a: VersionAnnouncement = "prete"): Promise<void> {
    for (const e of listeners) e(a);
    await nextTick();
  }

  it("offers to relaunch, and relaunches on click without reloading the page", async () => {
    const view = await mountView();
    await announce();

    const b = view.find(".bandeau-version").element as HTMLElement;
    expect(b.querySelector("button")?.textContent).toContain("Relancer");
    b.querySelector("button")!.click();
    await flushPromises();

    expect(activate).toHaveBeenCalledOnce();
    expect(reload).not.toHaveBeenCalled();
  });

  it("says in the banner that an installation failed", async () => {
    activate.mockRejectedValue("installation-echouee");
    const view = await mountView();
    await announce();
    (view.find(".bandeau-version button").element as HTMLElement).click();
    await flushPromises();
    expect(view.find(".bandeau-version").text()).toContain(
      "n’a pas pu s’installer",
    );
  });

  it("says that a token the vault refused will not be found at the next launch", async () => {
    const view = await mountView();
    inject(TokenService).vaultRefused.set("ecriture");
    await nextTick();
    const b = view.find(".bandeau-coffre");
    expect(b.exists()).toBe(true);
    expect(b.text()).toContain("ne sera pas retrouvé au lancement suivant");
  });

  it("says in English that an installation failed, and that the vault refused", async () => {
    inject(LocaleService).choice.set("en");
    activate.mockRejectedValue("installation-echouee");
    const view = await mountView();
    await announce();
    expect(view.find(".bandeau-version button").text()).toBe("Relaunch");
    (view.find(".bandeau-version button").element as HTMLElement).click();
    await flushPromises();
    expect(view.find(".bandeau-version").text()).toContain(
      "The new version could not be installed.",
    );
    inject(TokenService).vaultRefused.set("ecriture");
    await nextTick();
    expect(view.find(".bandeau-coffre").text()).toContain(
      "The system vault did not keep your token",
    );
  });
});

/**
 * What a deliverable adds to the shell, through a fake extension: the shared interface does not know what it renders — ADR-extensions-commerciales.
 */
describe("Shell extension points", () => {
  const alert = signal(false);
  const visible = signal(true);
  const activate = vi.fn();
  const bannerText = signal({
    fr: "Un bandeau apporté",
    en: "A contributed banner",
  });

  beforeEach(() => {
    provideHttpTesting();
    alert.set(false);
    visible.set(true);
    activate.mockClear();
    bannerText.set({ fr: "Un bandeau apporté", en: "A contributed banner" });
    provide(
      COMPOSITION,
      compose([
        {
          id: "factice",
          shell: {
            toolbarActions: [
              {
                id: "action-factice",
                label: {
                  fr: "Une action apportée",
                  en: "A contributed action",
                },
                icon: () => (alert() ? "warning" : "star"),
                title: () =>
                  alert()
                    ? { fr: "En alerte", en: "Alert" }
                    : { fr: "Au repos", en: "At rest" },
                alert: () => alert(),
                visible: () => visible(),
                activate,
              },
            ],
            banners: [
              {
                id: "bandeau-factice",
                icon: "info",
                text: () => bannerText(),
              },
            ],
          },
        },
      ]),
    );
  });

  async function mountView() {
    const router = createAppRouter(createMemoryHistory());
    await router.push("/");
    await router.isReady();
    const view = mount(App, { global: { plugins: [router] } });
    await nextTick();
    return view;
  }

  it("renders a contributed toolbar action, which follows its signals", async () => {
    const view = await mountView();
    const button = view.find('.barre [aria-label="Une action apportée"]');
    expect(button.exists()).toBe(true);
    expect(button.attributes("title")).toBe("Au repos");
    expect(button.text()).toContain("star");
    expect(button.classes()).not.toContain("alerte");

    alert.set(true);
    await nextTick();
    expect(button.attributes("title")).toBe("En alerte");
    expect(button.text()).toContain("warning");
    expect(button.classes()).toContain("alerte");

    await button.trigger("click");
    expect(activate).toHaveBeenCalledOnce();
  });

  it("places the contributed action before the GitHub sign-in", async () => {
    const view = await mountView();
    const labels = view
      .findAll(".barre [aria-label]")
      .map((b) => b.attributes("aria-label"));
    expect(labels.indexOf("Une action apportée")).toBeGreaterThan(-1);
    expect(labels.indexOf("Une action apportée")).toBeLessThan(
      labels.indexOf("Se connecter à GitHub"),
    );
  });

  it("hides an action its extension says is invisible", async () => {
    const view = await mountView();
    expect(view.find('[aria-label="Une action apportée"]').exists()).toBe(true);
    visible.set(false);
    await nextTick();
    expect(view.find('[aria-label="Une action apportée"]').exists()).toBe(
      false,
    );
  });

  it("renders a contributed banner in the shell's style, as long as it has something to say", async () => {
    const view = await mountView();
    const banner = view.find('.bandeau-quota[data-apport="bandeau-factice"]');
    expect(banner.text()).toContain("Un bandeau apporté");
    expect(banner.attributes("role")).toBe("status");

    bannerText.set({ fr: "", en: "" });
    await nextTick();
    expect(view.find('[data-apport="bandeau-factice"]').exists()).toBe(false);
  });

  it("renders the contributions in the displayed language", async () => {
    inject(LocaleService).choice.set("en");
    const view = await mountView();
    const button = view.find('.barre [aria-label="A contributed action"]');
    expect(button.attributes("title")).toBe("At rest");
    expect(view.find('[data-apport="bandeau-factice"]').text()).toContain(
      "A contributed banner",
    );
    expect(view.text()).not.toContain("apporté");
  });
});

/**
 * RG-langue-choisie: the language is a choice of the person, offered on every screen in the bottom bar — the top bar is full —, and applied without reloading.
 */
describe("Display language", () => {
  beforeEach(() => {
    provideHttpTesting();
  });

  async function mountView(url = "/ssk-it/ssk-canon/referentiel") {
    const router = createAppRouter(createMemoryHistory());
    await router.push(url);
    await router.isReady();
    const view = mount(App, {
      global: { plugins: [router] },
      attachTo: document.body,
    });
    await nextTick();
    return view;
  }

  it("shows the shell in English when English is chosen", async () => {
    inject(LocaleService).choice.set("en");
    const view = await mountView();
    const bar = view.find(".barre");
    expect(bar.text()).toContain("Functional");
    expect(bar.text()).toContain("Scopings");
    expect(bar.find('[aria-label="Sign in to GitHub"]').exists()).toBe(true);
    expect(view.find(".pied").text()).toContain("Legal notice");
    expect(view.text()).not.toContain("Mentions légales");
    view.unmount();
  });

  it("offers the three choices in the bottom bar, and applies one without reloading", async () => {
    const view = await mountView();
    const trigger = view.find('.pied [aria-label="Langue"]');
    expect(trigger.exists()).toBe(true);
    expect(trigger.text()).toContain("Français");
    await trigger.trigger("click");
    await nextTick();
    const entries = [...document.querySelectorAll(".ui-menu__entree")];
    expect(entries.map((e) => e.textContent?.trim())).toEqual([
      expect.stringContaining("Langue du navigateur"),
      expect.stringContaining("Français"),
      expect.stringContaining("English"),
    ]);
    (entries[2] as HTMLElement).click();
    await flushPromises();
    expect(inject(LocaleService).choice()).toBe("en");
    expect(view.find(".pied").text()).toContain("Legal notice");
    expect(view.find('.pied [aria-label="Language"]').text()).toContain(
      "English",
    );
    view.unmount();
  });
});

/**
 * The token under a passkey, in the web version — RG-secret-conserve-localement, RG-protection-du-jeton-par-projet. The token service's states are simulated: the shell's texts and gestures are what matter here.
 */
describe("Passkey banner", () => {
  let tokens: TokenService;

  beforeEach(() => {
    provideHttpTesting();
    tokens = inject(TokenService);
  });

  async function mountView() {
    const router = createAppRouter(createMemoryHistory());
    await router.push("/");
    await router.isReady();
    const view = mount(App, { global: { plugins: [router] } });
    await nextTick();
    return view;
  }

  it("shows nothing while the token expects nothing from the passkey", async () => {
    const view = await mountView();
    expect(view.find(".bandeau-passkey").exists()).toBe(false);
  });

  // 2026-065 decision 02: no passkey window forced on load.
  it("never requests the passkey by itself when it opens", async () => {
    vi.spyOn(tokens, "locked").mockReturnValue(true);
    const unlock = vi.spyOn(tokens, "unlock").mockResolvedValue("ouvert");
    await mountView();
    await flushPromises();
    expect(unlock).not.toHaveBeenCalled();
  });

  it("offers the passkey in a field the browser's autofill fills", async () => {
    vi.spyOn(tokens, "locked").mockReturnValue(true);
    vi.spyOn(tokens, "canOffer").mockResolvedValue(true);
    const offer = vi
      .spyOn(tokens, "offerUnlock")
      .mockReturnValue(new Promise(() => {}));
    const view = await mountView();
    await flushPromises();
    const field = view.find(".bandeau-passkey input");
    expect(field.attributes("autocomplete")).toBe("webauthn");
    expect(field.attributes("aria-label")).toBe("Votre clé d’accès Skanon");
    expect(offer).toHaveBeenCalledOnce();
  });

  // Without `username`, the browser offers no saved password there — the GitHub tokens it may keep as such.
  it("lets nothing be typed in the passkey field", async () => {
    vi.spyOn(tokens, "locked").mockReturnValue(true);
    vi.spyOn(tokens, "canOffer").mockResolvedValue(true);
    vi.spyOn(tokens, "offerUnlock").mockReturnValue(new Promise(() => {}));
    const view = await mountView();
    await flushPromises();
    const field = view.find<HTMLInputElement>(".bandeau-passkey input");
    const typing = new InputEvent("beforeinput", {
      inputType: "insertText",
      data: "ghp_",
      cancelable: true,
    });
    field.element.dispatchEvent(typing);
    expect(typing.defaultPrevented).toBe(true);
    // What the browser inserts without a cancellable `beforeinput` — a composition, an autofill — is emptied at once.
    await field.setValue("ghp_");
    expect(field.element.value).toBe("");
  });

  it("keeps only the button where the autofill cannot offer the passkey", async () => {
    vi.spyOn(tokens, "locked").mockReturnValue(true);
    vi.spyOn(tokens, "canOffer").mockResolvedValue(false);
    const offer = vi.spyOn(tokens, "offerUnlock");
    const view = await mountView();
    await flushPromises();
    expect(view.find(".bandeau-passkey input").exists()).toBe(false);
    expect(offer).not.toHaveBeenCalled();
  });

  it("offers to unlock sealed tokens with a click", async () => {
    vi.spyOn(tokens, "locked").mockReturnValue(true);
    vi.spyOn(tokens, "canOffer").mockResolvedValue(false);
    const unlock = vi.spyOn(tokens, "unlock").mockResolvedValue("ouvert");
    const view = await mountView();
    const banner = view.find(".bandeau-passkey");
    expect(banner.text()).toContain("protégés par une passkey");
    expect(banner.text()).toContain("tant qu’un onglet de Skanon reste ouvert");
    await banner
      .findAll("button")
      .find((b) => b.text() === "Déverrouiller")!
      .trigger("click");
    await flushPromises();
    expect(unlock).toHaveBeenCalled();
  });

  // 2026-065 decision 01: tokens opened in another tab, or here, open the repo.
  it("rereads the repo once the tokens are opened, here or in another tab", async () => {
    const reread = vi
      .spyOn(inject(SpecificationStore), "loadSpecification")
      .mockResolvedValue();
    await mountView();
    tokens.unlocks.update((n) => n + 1);
    await flushPromises();
    expect(reread).toHaveBeenCalledOnce();
  });

  it("offers to forget tokens the passkey no longer opens", async () => {
    vi.spyOn(tokens, "locked").mockReturnValue(true);
    vi.spyOn(tokens, "passkeyFailure").mockReturnValue("illisible");
    const erase = vi.spyOn(tokens, "erase").mockImplementation(() => {});
    const view = await mountView();
    const banner = view.find(".bandeau-passkey");
    expect(banner.text()).toContain("ne les ouvre plus");
    await banner
      .findAll("button")
      .find((b) => b.text() === "Oublier ces jetons")!
      .trigger("click");
    expect(erase).toHaveBeenCalled();
  });

  it("says that a project requires the passkey, and offers to protect the token", async () => {
    vi.spyOn(tokens, "form").mockReturnValue("session");
    vi.spyOn(tokens, "noAccess").mockReturnValue(false);
    const protect = vi.spyOn(tokens, "protect").mockResolvedValue("scelle");
    const view = await mountView();
    const banner = view.find(".bandeau-passkey");
    expect(banner.text()).toContain("exige");
    expect(banner.text()).toContain("pour cet onglet");
    await banner
      .findAll("button")
      .find((b) => b.text() === "Protéger par une passkey")!
      .trigger("click");
    expect(protect).toHaveBeenCalled();
  });

  it("names what remains when this browser cannot protect the token", async () => {
    vi.spyOn(tokens, "form").mockReturnValue("session");
    vi.spyOn(tokens, "noAccess").mockReturnValue(false);
    vi.spyOn(tokens, "passkeyFailure").mockReturnValue("impossible");
    const view = await mountView();
    expect(view.find(".bandeau-passkey").text()).toContain(
      "l’application de bureau",
    );
  });

  it("states plainly a token whose passkey was not created, and offers to retry", async () => {
    vi.spyOn(tokens, "form").mockReturnValue("en-clair");
    vi.spyOn(tokens, "passkeyFailure").mockReturnValue("annule");
    vi.spyOn(tokens, "noAccess").mockReturnValue(false);
    const view = await mountView();
    const banner = view.find(".bandeau-passkey");
    expect(banner.text()).toContain("en clair");
    expect(banner.findAll("button").some((b) => b.text() === "Réessayer")).toBe(
      true,
    );
  });
});
