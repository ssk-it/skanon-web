import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { PLATEFORME } from "../../plateforme/jeton";
import type { AnnonceVersion, CauseSansVersion } from "../../plateforme/ports";
import { createPlateformeWeb } from "../../plateforme/web";
import { inject, provide, resetInjection } from "../injection";
import {
  INTERVALLE_VERIFICATION,
  RECHARGER_PAGE,
  VersionService,
  estUrlDeSaisie,
} from "./version.service";

/**
 * Un annonceur simulé, à la place du service worker : ce qu'il annonce, et les deux appels qu'on lui fait. Le vrai ne tourne pas sous jsdom, et ne tournerait de toute façon qu'avec une version déployée à côté.
 */
class FauxAnnonceur {
  actif = true;
  relance = false;
  private readonly ecouteurs = new Set<(a: AnnonceVersion) => void>();
  private readonly ecouteursDeCause = new Set<
    (c: CauseSansVersion | null) => void
  >();
  readonly check = vi.fn<() => Promise<void>>(() => Promise.resolve());
  readonly activate = vi.fn<() => Promise<void>>(() => Promise.resolve());

  listen(surAnnonce: (a: AnnonceVersion) => void): () => void {
    this.ecouteurs.add(surAnnonce);
    return () => this.ecouteurs.delete(surAnnonce);
  }

  listenCause(surCause: (c: CauseSansVersion | null) => void): () => void {
    this.ecouteursDeCause.add(surCause);
    return () => this.ecouteursDeCause.delete(surCause);
  }

  annoncer(annonce: AnnonceVersion): void {
    for (const e of this.ecouteurs) e(annonce);
  }

  direCause(cause: CauseSansVersion | null): void {
    for (const e of this.ecouteursDeCause) e(cause);
  }
}

describe("VersionService", () => {
  let sw: FauxAnnonceur;
  let recharger: ReturnType<typeof vi.fn>;

  function creer(): VersionService {
    provide(PLATEFORME, { ...createPlateformeWeb(), version: sw });
    provide(RECHARGER_PAGE, recharger);
    return inject(VersionService);
  }

  function revenirAuPremierPlan(): void {
    Object.defineProperty(document, "visibilityState", {
      value: "visible",
      configurable: true,
    });
    document.dispatchEvent(new Event("visibilitychange"));
  }

  beforeEach(() => {
    sw = new FauxAnnonceur();
    recharger = vi.fn();
  });

  afterEach(() => {
    resetInjection();
    vi.useRealTimers();
    // la propriété définie par revenirAuPremierPlan masquait celle de jsdom
    delete (document as { visibilityState?: unknown }).visibilityState;
  });

  it("reste sur la version courante tant que rien n’est annoncé", () => {
    expect(creer().etat()).toBe("courante");
  });

  it("se dit prête quand une nouvelle version est téléchargée", () => {
    const service = creer();
    sw.annoncer("prete");
    expect(service.etat()).toBe("prete");
  });

  it("ignore les étapes qui précèdent la version prête", () => {
    // Le service worker de Skanon n'annonce que la version installée, prête à servir : une version détectée, encore en téléchargement, ne franchit pas le port. Rien n'est annoncé tant qu'elle n'est pas prête.
    const service = creer();
    expect(service.etat()).toBe("courante");
  });

  it("ne recharge jamais d’elle-même — RG-nouvelle-version-proposee", () => {
    creer();
    sw.annoncer("prete");
    expect(recharger).not.toHaveBeenCalled();
    expect(sw.activate).not.toHaveBeenCalled();
  });

  it("active la nouvelle version puis recharge, sur demande", async () => {
    const service = creer();
    sw.annoncer("prete");

    await service.reloadVersion();

    expect(sw.activate).toHaveBeenCalledOnce();
    expect(recharger).toHaveBeenCalledOnce();
    expect(sw.activate.mock.invocationCallOrder[0]).toBeLessThan(
      recharger.mock.invocationCallOrder[0]!,
    );
  });

  it("recharge même si l’activation échoue", async () => {
    // le rechargement suffit à servir la version prête : un échec de l'activation ne doit pas laisser le bouton sans effet
    sw.activate.mockRejectedValue(new Error("échec"));
    const service = creer();
    sw.annoncer("prete");

    await service.reloadVersion();

    expect(recharger).toHaveBeenCalledOnce();
  });

  it("se dit perdue quand le service worker ne peut plus servir la version", () => {
    const service = creer();
    sw.annoncer("perdue");
    expect(service.etat()).toBe("perdue");
  });

  it("reste perdue si une nouvelle version devient prête ensuite", () => {
    // le défaut le plus grave garde la parole : c'est lui qu'il faut expliquer
    const service = creer();
    sw.annoncer("perdue");
    sw.annoncer("prete");
    expect(service.etat()).toBe("perdue");
  });

  it("ne recharge pas d’elle-même une version perdue — RG-version-perdue-signalee", async () => {
    const service = creer();
    sw.annoncer("perdue");
    expect(recharger).not.toHaveBeenCalled();

    await service.reloadVersion();
    // rien à activer : seule la version publiée peut encore être servie
    expect(sw.activate).not.toHaveBeenCalled();
    expect(recharger).toHaveBeenCalledOnce();
  });

  it("vérifie au retour au premier plan", () => {
    creer();
    revenirAuPremierPlan();
    expect(sw.check).toHaveBeenCalledOnce();
  });

  it("ne vérifie pas quand la fenêtre passe à l’arrière-plan", () => {
    creer();
    Object.defineProperty(document, "visibilityState", {
      value: "hidden",
      configurable: true,
    });
    document.dispatchEvent(new Event("visibilitychange"));
    expect(sw.check).not.toHaveBeenCalled();
  });

  it("vérifie toutes les heures", () => {
    vi.useFakeTimers();
    creer();

    vi.advanceTimersByTime(INTERVALLE_VERIFICATION - 1);
    expect(sw.check).not.toHaveBeenCalled();

    vi.advanceTimersByTime(1);
    expect(sw.check).toHaveBeenCalledOnce();

    vi.advanceTimersByTime(INTERVALLE_VERIFICATION);
    expect(sw.check).toHaveBeenCalledTimes(2);
  });

  it("se tait quand une vérification échoue hors ligne", async () => {
    sw.check.mockRejectedValue(new Error("Failed to fetch"));
    const service = creer();

    await expect(service.checkVersion()).resolves.toBeUndefined();
    expect(service.etat()).toBe("courante");
  });

  it("cesse de vérifier une fois détruit", () => {
    vi.useFakeTimers();
    creer();
    resetInjection();

    revenirAuPremierPlan();
    vi.advanceTimersByTime(INTERVALLE_VERIFICATION);
    expect(sw.check).not.toHaveBeenCalled();
  });

  it("ne fait rien quand le service worker est désactivé", () => {
    // le cas du serveur de développement, où la version web n'inscrit pas de service worker
    sw.actif = false;
    vi.useFakeTimers();
    const service = creer();

    revenirAuPremierPlan();
    vi.advanceTimersByTime(INTERVALLE_VERIFICATION);
    expect(sw.check).not.toHaveBeenCalled();
    expect(service.etat()).toBe("courante");
  });

  describe("sur le bureau", () => {
    beforeEach(() => {
      sw.relance = true;
    });

    it("relance par l’annonceur, sans recharger la page", async () => {
      const service = creer();
      sw.annoncer("prete");

      await service.reloadVersion();

      expect(sw.activate).toHaveBeenCalledOnce();
      // la relance remplace la fenêtre : recharger la page avant n'aurait servi que l'ancienne version
      expect(recharger).not.toHaveBeenCalled();
    });

    it("dit que l’installation a échoué, et garde la version prête", async () => {
      sw.activate.mockRejectedValue("installation-echouee");
      const service = creer();
      sw.annoncer("prete");

      await service.reloadVersion();

      expect(service.cause()).toBe("installation-echouee");
      expect(service.etat()).toBe("prete");
      expect(recharger).not.toHaveBeenCalled();
    });

    it("dit pourquoi aucune version n’est annoncée — RG-nouvelle-version-proposee", () => {
      const service = creer();
      expect(service.cause()).toBeNull();

      // une cause que seul le livrable connaît : le service la relaie sans la lire
      const cause = "une-cause-du-livrable" as CauseSansVersion;
      sw.direCause(cause);
      expect(service.cause()).toBe(cause);
      expect(service.etat()).toBe("courante");

      sw.direCause(null);
      expect(service.cause()).toBeNull();
    });
  });

  it("se passe d’un service worker absent", () => {
    // jsdom n'a pas de service worker : la plateforme web par défaut n'a rien à annoncer
    provide(RECHARGER_PAGE, recharger);
    expect(inject(VersionService).etat()).toBe("courante");
  });
});

describe("estUrlDeSaisie", () => {
  it.each([
    "/ssk-it/ssk-canon/cadrages/nouveau",
    "/ssk-it/ssk-canon/cadrages/2026-049/editer",
    "/ssk-it/ssk-canon/cadrages/2026-049/editer?onglet=decisions",
    "/ssk-it/ssk-canon/reglages",
  ])("reconnaît une page de saisie : %s", (url) => {
    expect(estUrlDeSaisie(url)).toBe(true);
  });

  it.each([
    "/",
    "/ssk-it/ssk-canon/referentiel",
    "/ssk-it/ssk-canon/cadrages",
    "/ssk-it/ssk-canon/cadrages/2026-049",
    "/ssk-it/ssk-canon/cadrages/2026-049#01-recharger-ou-proposer",
    // un dépôt nommé comme une vue ne fait pas d'une page de lecture une saisie
    "/ssk-it/reglages/referentiel",
  ])("ne confond pas une page de lecture : %s", (url) => {
    expect(estUrlDeSaisie(url)).toBe(false);
  });
});
