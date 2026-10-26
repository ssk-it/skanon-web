import { flushPromises, mount, type VueWrapper } from "@vue/test-utils";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { nextTick } from "vue";
import { createMemoryHistory } from "vue-router";
import App from "./App.vue";
import { signal } from "./core/signaux";
import { COMPOSITION, composer } from "./extension/composer";
import { TokenService } from "./core/github/token.service";
import {
  provideHttpTesting,
  type HttpTestingController,
} from "./core/http/http-testing";
import { inject, provide } from "./core/injection";
import { ReferentielStore } from "./core/repo/referentiel.store";
import { RECHARGER_PAGE } from "./core/ui/version.service";
import { PLATEFORME } from "./plateforme/jeton";
import type { AnnonceVersion } from "./plateforme/ports";
import { createPlateformeWeb } from "./plateforme/web";
import { createRouteur } from "./routeur";

/**
 * Le chargement est déclenché par le garde de route, non par la barre : c'est l'adresse qui dit quel dépôt ouvrir. Ces cas visent donc le store, appelé comme le garde l'appelle.
 */
describe("Chargement du dépôt", () => {
  let httpMock: HttpTestingController;
  let store: ReferentielStore;

  beforeEach(() => {
    httpMock = provideHttpTesting();
    store = inject(ReferentielStore);
  });

  it("demande l’arborescence du dépôt", async () => {
    void store.loadReferentiel({ owner: "ssk-it", repo: "ssk-canon" });

    // un seul appel d'API pour l'arborescence : les contenus passent par raw, qui n'est pas décompté du quota
    const requete = httpMock.expectOne((r) => r.url.includes("/git/trees/"));
    expect(requete.request.url).toContain("recursive=1");
    expect(store.etat()).toBe("chargement");
  });

  it("passe à l’état prêt une fois l’arborescence vide reçue", async () => {
    const attente = store.loadReferentiel({
      owner: "ssk-it",
      repo: "ssk-canon",
    });

    httpMock
      .expectOne((r) => r.url.includes("/git/trees/"))
      .flush({ sha: "abc", truncated: false, tree: [] });

    await attente;
    expect(store.etat()).toBe("pret");
  });

  it("signale une erreur lisible quand le dépôt est introuvable", async () => {
    const attente = store.loadReferentiel({ owner: "ssk-it", repo: "absent" });

    httpMock
      .expectOne((r) => r.url.includes("/git/trees/"))
      .flush("Not Found", { status: 404, statusText: "Not Found" });

    await attente;
    expect(store.etat()).toBe("erreur");
    // le message doit dire quoi faire, pas seulement que ça a échoué
    expect(store.erreur()).toContain("public");
  });
});

describe("App", () => {
  beforeEach(() => {
    provideHttpTesting();
  });

  it("affiche le nom du produit dans la barre", async () => {
    const routeur = createRouteur(createMemoryHistory());
    await routeur.push("/");
    await routeur.isReady();

    const vue = mount(App, { global: { plugins: [routeur] } });
    await flushPromises();

    expect(vue.find(".barre").text()).toContain("Skanon");
  });

  // RG-aide-a-portee : l'aide n'est pas une vue d'un projet, sa porte est partout.
  it.each([["/"], ["/ssk-it/ssk-canon/referentiel"]])(
    "mène à l’aide depuis la barre, sur %s",
    async (url) => {
      const routeur = createRouteur(createMemoryHistory());
      await routeur.push(url);
      await routeur.isReady();

      const vue = mount(App, { global: { plugins: [routeur] } });
      await flushPromises();

      const aide = vue.find('.barre a[aria-label="Fonctionnement de Skanon"]');
      expect(aide.exists()).toBe(true);
      expect(aide.attributes("href")).toBe("/aide");
    },
  );

  // La barre du haut est pleine (2026-041, 2026-054) : ce qu'on ne consulte pas en travaillant va en bas.
  it.each([["/"], ["/ssk-it/ssk-canon/referentiel"]])(
    "porte, en bas, la version et les mentions légales, sur %s",
    async (url) => {
      provide(PLATEFORME, {
        ...createPlateformeWeb(),
        loadVersion: async () => "2026.10.1",
      });
      const routeur = createRouteur(createMemoryHistory());
      await routeur.push(url);
      await routeur.isReady();

      const vue = mount(App, { global: { plugins: [routeur] } });
      await flushPromises();

      const pied = vue.find("footer.pied");
      expect(pied.text()).toContain("Skanon 2026.10.1");
      const mentions = pied.find('a[href="/mentions-legales"]');
      expect(mentions.text()).toBe("Mentions légales");
    },
  );

  it("tait la version que la plateforme ne sait pas dire", async () => {
    provide(PLATEFORME, {
      ...createPlateformeWeb(),
      loadVersion: () => Promise.reject(new Error("indisponible")),
    });
    const routeur = createRouteur(createMemoryHistory());
    await routeur.push("/");
    await routeur.isReady();

    const vue = mount(App, { global: { plugins: [routeur] } });
    await flushPromises();

    expect(vue.find("footer.pied").text()).not.toContain("Skanon");
    expect(vue.find('footer.pied a[href="/mentions-legales"]').exists()).toBe(
      true,
    );
  });
});

/**
 * Le bandeau de version — RG-nouvelle-version-proposee, RG-version-perdue-signalee. L'annonceur de la plateforme est simulé : seules ses annonces comptent ici, la vérification est l'affaire du service.
 */
describe("Bandeau de version", () => {
  let ecouteurs: Set<(a: AnnonceVersion) => void>;
  let activer: ReturnType<typeof vi.fn>;
  let recharger: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    provideHttpTesting();
    ecouteurs = new Set();
    activer = vi.fn(() => Promise.resolve());
    recharger = vi.fn();
    provide(PLATEFORME, {
      ...createPlateformeWeb(),
      version: {
        actif: true,
        relance: false,
        listen: (e: (a: AnnonceVersion) => void) => {
          ecouteurs.add(e);
          return () => ecouteurs.delete(e);
        },
        listenCause: () => () => {},
        check: () => Promise.resolve(),
        activate: activer,
      },
    });
    provide(RECHARGER_PAGE, recharger);
  });

  async function monter(url = "/ssk-it/ssk-canon/referentiel") {
    const routeur = createRouteur(createMemoryHistory());
    await routeur.push(url);
    await routeur.isReady();
    const vue = mount(App, { global: { plugins: [routeur] } });
    await nextTick();
    return vue;
  }

  async function annoncer(a: AnnonceVersion = "prete"): Promise<void> {
    for (const e of ecouteurs) e(a);
    await nextTick();
  }

  function bandeau(vue: VueWrapper): HTMLElement | null {
    const trouve = vue.find(".bandeau-version");
    return trouve.exists() ? (trouve.element as HTMLElement) : null;
  }

  it("ne montre rien tant qu’aucune version n’attend", async () => {
    const vue = await monter();
    expect(bandeau(vue)).toBeNull();
  });

  it("annonce la version prête et propose de recharger", async () => {
    const vue = await monter();
    await annoncer();

    const b = bandeau(vue)!;
    expect(b.textContent).toContain("nouvelle version de Skanon est prête");
    expect(b.querySelector("button")?.textContent).toContain("Recharger");
    // rien ne s'efface sans que le rédacteur l'ait décidé
    expect(recharger).not.toHaveBeenCalled();
  });

  it("recharge au clic, après avoir activé la version", async () => {
    const vue = await monter();
    await annoncer();

    bandeau(vue)!.querySelector("button")!.click();
    await flushPromises();

    expect(activer).toHaveBeenCalledOnce();
    expect(recharger).toHaveBeenCalledOnce();
  });

  it("se montre aussi hors d’un projet", async () => {
    const vue = await monter("/");
    await annoncer();
    expect(bandeau(vue)).not.toBeNull();
  });

  it("prévient qu’une saisie non enregistrée serait perdue", async () => {
    const vue = await monter("/ssk-it/ssk-canon/cadrages/2026-049/editer");
    await annoncer();
    expect(bandeau(vue)!.textContent).toContain("saisie non enregistrée");
  });

  it("ne parle pas de saisie sur une page de lecture", async () => {
    const vue = await monter("/ssk-it/ssk-canon/cadrages/2026-049");
    await annoncer();
    expect(bandeau(vue)!.textContent).not.toContain("saisie");
  });

  it("prévient que l’accès temporaire prendra fin — RG-acces-temporaire", async () => {
    inject(TokenService).definirAcces({
      jeton: "ghs_temporaire",
      valideJusqua: new Date(Date.now() + 3_600_000).toISOString(),
      depots: ["ssk-it/ssk-canon"],
      identite: { identifiant: "ssk", nom: "SSK", courriel: null },
    });
    const vue = await monter();
    await annoncer();
    expect(bandeau(vue)!.textContent).toContain("identité vérifiée");
  });

  it("nomme une version perdue, avec sa cause propre", async () => {
    const vue = await monter();
    await annoncer("perdue");

    const b = bandeau(vue)!;
    expect(b.classList).toContain("perdue");
    expect(b.textContent).toContain("n’est plus entièrement disponible");
    // une cause distincte de l'absence de réseau ne partage pas son texte
    expect(b.textContent).not.toContain("prête");
    expect(recharger).not.toHaveBeenCalled();

    b.querySelector("button")!.click();
    await flushPromises();
    expect(activer).not.toHaveBeenCalled();
    expect(recharger).toHaveBeenCalledOnce();
  });
});

/**
 * L'application de bureau : la relance, le coffre qui refuse — RG-nouvelle-version-proposee, RG-secret-conserve-localement. L'annonceur est simulé : ce sont les textes et les gestes de la coquille qui comptent ici. Ce que l'application de bureau y ajoute s'éprouve dans son dépôt, avec ses extensions.
 */
describe("Coquille du bureau", () => {
  let ecouteurs: Set<(a: AnnonceVersion) => void>;
  let activer: ReturnType<typeof vi.fn>;
  let recharger: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    provideHttpTesting();
    ecouteurs = new Set();
    activer = vi.fn(() => Promise.resolve());
    recharger = vi.fn();
    provide(PLATEFORME, {
      ...createPlateformeWeb(),
      cible: "bureau",
      version: {
        actif: true,
        relance: true,
        listen: (e: (a: AnnonceVersion) => void) => {
          ecouteurs.add(e);
          return () => ecouteurs.delete(e);
        },
        listenCause: () => () => {},
        check: () => Promise.resolve(),
        activate: activer,
      },
    });
    provide(RECHARGER_PAGE, recharger);
  });

  async function monter(url = "/ssk-it/ssk-canon/referentiel") {
    const routeur = createRouteur(createMemoryHistory());
    await routeur.push(url);
    await routeur.isReady();
    const vue = mount(App, { global: { plugins: [routeur] } });
    await nextTick();
    return vue;
  }

  async function annoncer(a: AnnonceVersion = "prete"): Promise<void> {
    for (const e of ecouteurs) e(a);
    await nextTick();
  }

  it("propose de relancer, et relance au clic sans recharger la page", async () => {
    const vue = await monter();
    await annoncer();

    const b = vue.find(".bandeau-version").element as HTMLElement;
    expect(b.querySelector("button")?.textContent).toContain("Relancer");
    b.querySelector("button")!.click();
    await flushPromises();

    expect(activer).toHaveBeenCalledOnce();
    expect(recharger).not.toHaveBeenCalled();
  });

  it("dit qu’une installation a échoué, dans le bandeau", async () => {
    activer.mockRejectedValue("installation-echouee");
    const vue = await monter();
    await annoncer();
    (vue.find(".bandeau-version button").element as HTMLElement).click();
    await flushPromises();
    expect(vue.find(".bandeau-version").text()).toContain(
      "n’a pas pu s’installer",
    );
  });

  it("dit qu’un jeton que le coffre a refusé ne sera pas retrouvé au lancement suivant", async () => {
    const vue = await monter();
    inject(TokenService).coffreRefuse.set("ecriture");
    await nextTick();
    const b = vue.find(".bandeau-coffre");
    expect(b.exists()).toBe(true);
    expect(b.text()).toContain("ne sera pas retrouvé au lancement suivant");
  });
});

/**
 * Ce qu'un livrable ajoute à la coquille, par une extension factice : l'interface commune ne sait pas ce qu'elle rend — ADR-extensions-commerciales.
 */
describe("Points d'extension de la coquille", () => {
  const alerte = signal(false);
  const visible = signal(true);
  const activer = vi.fn();
  const texteBandeau = signal("Un bandeau apporté");

  beforeEach(() => {
    provideHttpTesting();
    alerte.set(false);
    visible.set(true);
    activer.mockClear();
    texteBandeau.set("Un bandeau apporté");
    provide(
      COMPOSITION,
      composer([
        {
          id: "factice",
          coquille: {
            actionsDeBarre: [
              {
                id: "action-factice",
                libelle: "Une action apportée",
                icone: () => (alerte() ? "warning" : "star"),
                titre: () => (alerte() ? "En alerte" : "Au repos"),
                alerte: () => alerte(),
                visible: () => visible(),
                activer,
              },
            ],
            bandeaux: [
              {
                id: "bandeau-factice",
                icone: "info",
                texte: () => texteBandeau(),
              },
            ],
          },
        },
      ]),
    );
  });

  async function monter() {
    const routeur = createRouteur(createMemoryHistory());
    await routeur.push("/");
    await routeur.isReady();
    const vue = mount(App, { global: { plugins: [routeur] } });
    await nextTick();
    return vue;
  }

  it("rend une action de barre apportée, qui suit ses signaux", async () => {
    const vue = await monter();
    const bouton = vue.find('.barre [aria-label="Une action apportée"]');
    expect(bouton.exists()).toBe(true);
    expect(bouton.attributes("title")).toBe("Au repos");
    expect(bouton.text()).toContain("star");
    expect(bouton.classes()).not.toContain("alerte");

    alerte.set(true);
    await nextTick();
    expect(bouton.attributes("title")).toBe("En alerte");
    expect(bouton.text()).toContain("warning");
    expect(bouton.classes()).toContain("alerte");

    await bouton.trigger("click");
    expect(activer).toHaveBeenCalledOnce();
  });

  it("place l'action apportée avant la connexion à GitHub", async () => {
    const vue = await monter();
    const libelles = vue
      .findAll(".barre [aria-label]")
      .map((b) => b.attributes("aria-label"));
    expect(libelles.indexOf("Une action apportée")).toBeGreaterThan(-1);
    expect(libelles.indexOf("Une action apportée")).toBeLessThan(
      libelles.indexOf("Se connecter à GitHub"),
    );
  });

  it("cache une action que son extension dit invisible", async () => {
    const vue = await monter();
    expect(vue.find('[aria-label="Une action apportée"]').exists()).toBe(true);
    visible.set(false);
    await nextTick();
    expect(vue.find('[aria-label="Une action apportée"]').exists()).toBe(false);
  });

  it("rend un bandeau apporté dans le style de la coquille, tant qu'il a quelque chose à dire", async () => {
    const vue = await monter();
    const bandeau = vue.find('.bandeau-quota[data-apport="bandeau-factice"]');
    expect(bandeau.text()).toContain("Un bandeau apporté");
    expect(bandeau.attributes("role")).toBe("status");

    texteBandeau.set("");
    await nextTick();
    expect(vue.find('[data-apport="bandeau-factice"]').exists()).toBe(false);
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

  async function monter() {
    const routeur = createRouteur(createMemoryHistory());
    await routeur.push("/");
    await routeur.isReady();
    const vue = mount(App, { global: { plugins: [routeur] } });
    await nextTick();
    return vue;
  }

  it("ne montre rien tant que le jeton n’attend rien de la passkey", async () => {
    const vue = await monter();
    expect(vue.find(".bandeau-passkey").exists()).toBe(false);
  });

  it("sollicite la passkey dès l’ouverture, puis relit le dépôt", async () => {
    vi.spyOn(tokens, "verrouille").mockReturnValue(true);
    const deverrouiller = vi
      .spyOn(tokens, "deverrouillerSansGeste")
      .mockResolvedValue("ouvert");
    const relire = vi
      .spyOn(inject(ReferentielStore), "loadReferentiel")
      .mockResolvedValue();
    await monter();
    await flushPromises();
    expect(deverrouiller).toHaveBeenCalledOnce();
    expect(relire).toHaveBeenCalled();
  });

  it("propose de déverrouiller des jetons scellés, puis relit le dépôt", async () => {
    vi.spyOn(tokens, "verrouille").mockReturnValue(true);
    vi.spyOn(tokens, "deverrouillerSansGeste").mockResolvedValue("annule");
    const deverrouiller = vi
      .spyOn(tokens, "deverrouiller")
      .mockResolvedValue("ouvert");
    const relire = vi
      .spyOn(inject(ReferentielStore), "loadReferentiel")
      .mockResolvedValue();
    const vue = await monter();
    const bandeau = vue.find(".bandeau-passkey");
    expect(bandeau.text()).toContain("protégés par une passkey");
    await bandeau
      .findAll("button")
      .find((b) => b.text() === "Déverrouiller")!
      .trigger("click");
    await flushPromises();
    expect(deverrouiller).toHaveBeenCalled();
    expect(relire).toHaveBeenCalled();
  });

  it("propose d’oublier des jetons que la passkey n’ouvre plus", async () => {
    vi.spyOn(tokens, "verrouille").mockReturnValue(true);
    vi.spyOn(tokens, "echecPasskey").mockReturnValue("illisible");
    const effacer = vi.spyOn(tokens, "effacer").mockImplementation(() => {});
    const vue = await monter();
    const bandeau = vue.find(".bandeau-passkey");
    expect(bandeau.text()).toContain("ne les ouvre plus");
    await bandeau
      .findAll("button")
      .find((b) => b.text() === "Oublier ces jetons")!
      .trigger("click");
    expect(effacer).toHaveBeenCalled();
  });

  it("dit qu’un projet exige la passkey, et propose de protéger le jeton", async () => {
    vi.spyOn(tokens, "forme").mockReturnValue("session");
    vi.spyOn(tokens, "aucunAcces").mockReturnValue(false);
    const proteger = vi.spyOn(tokens, "proteger").mockResolvedValue("scelle");
    const vue = await monter();
    const bandeau = vue.find(".bandeau-passkey");
    expect(bandeau.text()).toContain("exige");
    expect(bandeau.text()).toContain("pour cet onglet");
    await bandeau
      .findAll("button")
      .find((b) => b.text() === "Protéger par une passkey")!
      .trigger("click");
    expect(proteger).toHaveBeenCalled();
  });

  it("nomme ce qui reste quand ce navigateur ne sait pas protéger le jeton", async () => {
    vi.spyOn(tokens, "forme").mockReturnValue("session");
    vi.spyOn(tokens, "aucunAcces").mockReturnValue(false);
    vi.spyOn(tokens, "echecPasskey").mockReturnValue("impossible");
    const vue = await monter();
    expect(vue.find(".bandeau-passkey").text()).toContain(
      "l’application de bureau",
    );
  });

  it("dit en clair un jeton dont la passkey n’a pas été créée, et propose de réessayer", async () => {
    vi.spyOn(tokens, "forme").mockReturnValue("en-clair");
    vi.spyOn(tokens, "echecPasskey").mockReturnValue("annule");
    vi.spyOn(tokens, "aucunAcces").mockReturnValue(false);
    const vue = await monter();
    const bandeau = vue.find(".bandeau-passkey");
    expect(bandeau.text()).toContain("en clair");
    expect(
      bandeau.findAll("button").some((b) => b.text() === "Réessayer"),
    ).toBe(true);
  });
});
