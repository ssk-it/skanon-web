import { flushPromises, mount, type VueWrapper } from "@vue/test-utils";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { nextTick } from "vue";
import { createMemoryHistory } from "vue-router";
import App from "./App.vue";
import { signal } from "./core/signaux";
import { COMPOSITION, compose } from "./extension/composer";
import { TokenService } from "./core/github/token.service";
import {
  provideHttpTesting,
  type HttpTestingController,
} from "./core/http/http-testing";
import { inject, provide } from "./core/injection";
import { SpecificationStore } from "./core/repo/referentiel.store";
import { RELOAD_PAGE } from "./core/ui/version.service";
import { PLATFORM } from "./plateforme/jeton";
import type { VersionAnnouncement } from "./plateforme/ports";
import { createWebPlatform } from "./plateforme/web";
import { createAppRouter } from "./routeur";

/**
 * Le chargement est déclenché par le garde de route, non par la barre : c'est l'adresse qui dit quel dépôt ouvrir. Ces cas visent donc le store, appelé comme le garde l'appelle.
 */
describe("Chargement du dépôt", () => {
  let httpMock: HttpTestingController;
  let store: SpecificationStore;

  beforeEach(() => {
    httpMock = provideHttpTesting();
    store = inject(SpecificationStore);
  });

  it("demande l’arborescence du dépôt", async () => {
    void store.loadSpecification({ owner: "ssk-it", repo: "ssk-canon" });

    // un seul appel d'API pour l'arborescence : les contenus passent par raw, qui n'est pas décompté du quota
    const query = httpMock.expectOne((r) => r.url.includes("/git/trees/"));
    expect(query.request.url).toContain("recursive=1");
    expect(store.state()).toBe("chargement");
  });

  it("passe à l’état prêt une fois l’arborescence vide reçue", async () => {
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

  it("signale une erreur lisible quand le dépôt est introuvable", async () => {
    const pending = store.loadSpecification({
      owner: "ssk-it",
      repo: "absent",
    });

    httpMock
      .expectOne((r) => r.url.includes("/git/trees/"))
      .flush("Not Found", { status: 404, statusText: "Not Found" });

    await pending;
    expect(store.state()).toBe("erreur");
    // le message doit dire quoi faire, pas seulement que ça a échoué
    expect(store.error()).toContain("public");
  });
});

describe("App", () => {
  beforeEach(() => {
    provideHttpTesting();
  });

  it("affiche le nom du produit dans la barre", async () => {
    const router = createAppRouter(createMemoryHistory());
    await router.push("/");
    await router.isReady();

    const view = mount(App, { global: { plugins: [router] } });
    await flushPromises();

    expect(view.find(".barre").text()).toContain("Skanon");
  });

  // RG-aide-a-portee : l'aide n'est pas une vue d'un projet, sa porte est partout.
  it.each([["/"], ["/ssk-it/ssk-canon/referentiel"]])(
    "mène à l’aide depuis la barre, sur %s",
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

  // La barre du haut est pleine (2026-041, 2026-054) : ce qu'on ne consulte pas en travaillant va en bas.
  it.each([["/"], ["/ssk-it/ssk-canon/referentiel"]])(
    "porte, en bas, la version et les mentions légales, sur %s",
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

  it("tait la version que la plateforme ne sait pas dire", async () => {
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
 * Le bandeau de version — RG-nouvelle-version-proposee, RG-version-perdue-signalee. L'annonceur de la plateforme est simulé : seules ses annonces comptent ici, la vérification est l'affaire du service.
 */
describe("Bandeau de version", () => {
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

  it("ne montre rien tant qu’aucune version n’attend", async () => {
    const view = await mountView();
    expect(banner(view)).toBeNull();
  });

  it("annonce la version prête et propose de recharger", async () => {
    const view = await mountView();
    await announce();

    const b = banner(view)!;
    expect(b.textContent).toContain("nouvelle version de Skanon est prête");
    expect(b.querySelector("button")?.textContent).toContain("Recharger");
    // rien ne s'efface sans que le rédacteur l'ait décidé
    expect(reload).not.toHaveBeenCalled();
  });

  it("recharge au clic, après avoir activé la version", async () => {
    const view = await mountView();
    await announce();

    banner(view)!.querySelector("button")!.click();
    await flushPromises();

    expect(activate).toHaveBeenCalledOnce();
    expect(reload).toHaveBeenCalledOnce();
  });

  it("se montre aussi hors d’un projet", async () => {
    const view = await mountView("/");
    await announce();
    expect(banner(view)).not.toBeNull();
  });

  it("prévient qu’une saisie non enregistrée serait perdue", async () => {
    const view = await mountView("/ssk-it/ssk-canon/cadrages/2026-049/editer");
    await announce();
    expect(banner(view)!.textContent).toContain("saisie non enregistrée");
  });

  it("ne parle pas de saisie sur une page de lecture", async () => {
    const view = await mountView("/ssk-it/ssk-canon/cadrages/2026-049");
    await announce();
    expect(banner(view)!.textContent).not.toContain("saisie");
  });

  it("prévient que l’accès temporaire prendra fin — RG-acces-temporaire", async () => {
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

  it("nomme une version perdue, avec sa cause propre", async () => {
    const view = await mountView();
    await announce("perdue");

    const b = banner(view)!;
    expect(b.classList).toContain("perdue");
    expect(b.textContent).toContain("n’est plus entièrement disponible");
    // une cause distincte de l'absence de réseau ne partage pas son texte
    expect(b.textContent).not.toContain("prête");
    expect(reload).not.toHaveBeenCalled();

    b.querySelector("button")!.click();
    await flushPromises();
    expect(activate).not.toHaveBeenCalled();
    expect(reload).toHaveBeenCalledOnce();
  });
});

/**
 * L'application de bureau : la relance, le coffre qui refuse — RG-nouvelle-version-proposee, RG-secret-conserve-localement. L'annonceur est simulé : ce sont les textes et les gestes de la coquille qui comptent ici. Ce que l'application de bureau y ajoute s'éprouve dans son dépôt, avec ses extensions.
 */
describe("Coquille du bureau", () => {
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

  it("propose de relancer, et relance au clic sans recharger la page", async () => {
    const view = await mountView();
    await announce();

    const b = view.find(".bandeau-version").element as HTMLElement;
    expect(b.querySelector("button")?.textContent).toContain("Relancer");
    b.querySelector("button")!.click();
    await flushPromises();

    expect(activate).toHaveBeenCalledOnce();
    expect(reload).not.toHaveBeenCalled();
  });

  it("dit qu’une installation a échoué, dans le bandeau", async () => {
    activate.mockRejectedValue("installation-echouee");
    const view = await mountView();
    await announce();
    (view.find(".bandeau-version button").element as HTMLElement).click();
    await flushPromises();
    expect(view.find(".bandeau-version").text()).toContain(
      "n’a pas pu s’installer",
    );
  });

  it("dit qu’un jeton que le coffre a refusé ne sera pas retrouvé au lancement suivant", async () => {
    const view = await mountView();
    inject(TokenService).vaultRefused.set("ecriture");
    await nextTick();
    const b = view.find(".bandeau-coffre");
    expect(b.exists()).toBe(true);
    expect(b.text()).toContain("ne sera pas retrouvé au lancement suivant");
  });
});

/**
 * Ce qu'un livrable ajoute à la coquille, par une extension factice : l'interface commune ne sait pas ce qu'elle rend — ADR-extensions-commerciales.
 */
describe("Points d'extension de la coquille", () => {
  const alert = signal(false);
  const visible = signal(true);
  const activate = vi.fn();
  const bannerText = signal("Un bandeau apporté");

  beforeEach(() => {
    provideHttpTesting();
    alert.set(false);
    visible.set(true);
    activate.mockClear();
    bannerText.set("Un bandeau apporté");
    provide(
      COMPOSITION,
      compose([
        {
          id: "factice",
          shell: {
            toolbarActions: [
              {
                id: "action-factice",
                label: "Une action apportée",
                icon: () => (alert() ? "warning" : "star"),
                title: () => (alert() ? "En alerte" : "Au repos"),
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

  it("rend une action de barre apportée, qui suit ses signaux", async () => {
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

  it("place l'action apportée avant la connexion à GitHub", async () => {
    const view = await mountView();
    const labels = view
      .findAll(".barre [aria-label]")
      .map((b) => b.attributes("aria-label"));
    expect(labels.indexOf("Une action apportée")).toBeGreaterThan(-1);
    expect(labels.indexOf("Une action apportée")).toBeLessThan(
      labels.indexOf("Se connecter à GitHub"),
    );
  });

  it("cache une action que son extension dit invisible", async () => {
    const view = await mountView();
    expect(view.find('[aria-label="Une action apportée"]').exists()).toBe(true);
    visible.set(false);
    await nextTick();
    expect(view.find('[aria-label="Une action apportée"]').exists()).toBe(
      false,
    );
  });

  it("rend un bandeau apporté dans le style de la coquille, tant qu'il a quelque chose à dire", async () => {
    const view = await mountView();
    const banner = view.find('.bandeau-quota[data-apport="bandeau-factice"]');
    expect(banner.text()).toContain("Un bandeau apporté");
    expect(banner.attributes("role")).toBe("status");

    bannerText.set("");
    await nextTick();
    expect(view.find('[data-apport="bandeau-factice"]').exists()).toBe(false);
  });
});

/**
 * Le jeton sous passkey, dans la version web — RG-secret-conserve-localement, RG-protection-du-jeton-par-projet. Les états du service des jetons sont simulés : ce sont les textes et les gestes de la coquille qui comptent ici.
 */
describe("Bandeau de la passkey", () => {
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

  it("ne montre rien tant que le jeton n’attend rien de la passkey", async () => {
    const view = await mountView();
    expect(view.find(".bandeau-passkey").exists()).toBe(false);
  });

  it("sollicite la passkey dès l’ouverture, puis relit le dépôt", async () => {
    vi.spyOn(tokens, "locked").mockReturnValue(true);
    const unlock = vi
      .spyOn(tokens, "unlockWithoutGesture")
      .mockResolvedValue("ouvert");
    const reread = vi
      .spyOn(inject(SpecificationStore), "loadSpecification")
      .mockResolvedValue();
    await mountView();
    await flushPromises();
    expect(unlock).toHaveBeenCalledOnce();
    expect(reread).toHaveBeenCalled();
  });

  it("propose de déverrouiller des jetons scellés, puis relit le dépôt", async () => {
    vi.spyOn(tokens, "locked").mockReturnValue(true);
    vi.spyOn(tokens, "unlockWithoutGesture").mockResolvedValue("annule");
    const unlock = vi.spyOn(tokens, "unlock").mockResolvedValue("ouvert");
    const reread = vi
      .spyOn(inject(SpecificationStore), "loadSpecification")
      .mockResolvedValue();
    const view = await mountView();
    const banner = view.find(".bandeau-passkey");
    expect(banner.text()).toContain("protégés par une passkey");
    await banner
      .findAll("button")
      .find((b) => b.text() === "Déverrouiller")!
      .trigger("click");
    await flushPromises();
    expect(unlock).toHaveBeenCalled();
    expect(reread).toHaveBeenCalled();
  });

  it("propose d’oublier des jetons que la passkey n’ouvre plus", async () => {
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

  it("dit qu’un projet exige la passkey, et propose de protéger le jeton", async () => {
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

  it("nomme ce qui reste quand ce navigateur ne sait pas protéger le jeton", async () => {
    vi.spyOn(tokens, "form").mockReturnValue("session");
    vi.spyOn(tokens, "noAccess").mockReturnValue(false);
    vi.spyOn(tokens, "passkeyFailure").mockReturnValue("impossible");
    const view = await mountView();
    expect(view.find(".bandeau-passkey").text()).toContain(
      "l’application de bureau",
    );
  });

  it("dit en clair un jeton dont la passkey n’a pas été créée, et propose de réessayer", async () => {
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
