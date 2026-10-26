import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { PLATFORM } from "../../plateforme/jeton";
import type {
  VersionAnnouncement,
  NoVersionCause,
} from "../../plateforme/ports";
import { createWebPlatform } from "../../plateforme/web";
import { inject, provide, resetInjection } from "../injection";
import {
  CHECK_INTERVAL,
  RELOAD_PAGE,
  VersionService,
  isInputUrl,
} from "./version.service";

/**
 * Un annonceur simulé, à la place du service worker : ce qu'il annonce, et les deux appels qu'on lui fait. Le vrai ne tourne pas sous jsdom, et ne tournerait de toute façon qu'avec une version déployée à côté.
 */
class FakeAnnouncer {
  active = true;
  relaunches = false;
  private readonly listeners = new Set<(a: VersionAnnouncement) => void>();
  private readonly causeListeners = new Set<
    (c: NoVersionCause | null) => void
  >();
  readonly check = vi.fn<() => Promise<void>>(() => Promise.resolve());
  readonly activate = vi.fn<() => Promise<void>>(() => Promise.resolve());

  listen(onAnnouncement: (a: VersionAnnouncement) => void): () => void {
    this.listeners.add(onAnnouncement);
    return () => this.listeners.delete(onAnnouncement);
  }

  listenCause(onCause: (c: NoVersionCause | null) => void): () => void {
    this.causeListeners.add(onCause);
    return () => this.causeListeners.delete(onCause);
  }

  announce(announcement: VersionAnnouncement): void {
    for (const e of this.listeners) e(announcement);
  }

  sayCause(cause: NoVersionCause | null): void {
    for (const e of this.causeListeners) e(cause);
  }
}

describe("VersionService", () => {
  let sw: FakeAnnouncer;
  let reload: ReturnType<typeof vi.fn>;

  function create(): VersionService {
    provide(PLATFORM, { ...createWebPlatform(), version: sw });
    provide(RELOAD_PAGE, reload);
    return inject(VersionService);
  }

  function returnToForeground(): void {
    Object.defineProperty(document, "visibilityState", {
      value: "visible",
      configurable: true,
    });
    document.dispatchEvent(new Event("visibilitychange"));
  }

  beforeEach(() => {
    sw = new FakeAnnouncer();
    reload = vi.fn();
  });

  afterEach(() => {
    resetInjection();
    vi.useRealTimers();
    // la propriété définie par revenirAuPremierPlan masquait celle de jsdom
    delete (document as { visibilityState?: unknown }).visibilityState;
  });

  it("reste sur la version courante tant que rien n’est annoncé", () => {
    expect(create().state()).toBe("courante");
  });

  it("se dit prête quand une nouvelle version est téléchargée", () => {
    const service = create();
    sw.announce("prete");
    expect(service.state()).toBe("prete");
  });

  it("ignore les étapes qui précèdent la version prête", () => {
    // Le service worker de Skanon n'annonce que la version installée, prête à servir : une version détectée, encore en téléchargement, ne franchit pas le port. Rien n'est annoncé tant qu'elle n'est pas prête.
    const service = create();
    expect(service.state()).toBe("courante");
  });

  it("ne recharge jamais d’elle-même — RG-nouvelle-version-proposee", () => {
    create();
    sw.announce("prete");
    expect(reload).not.toHaveBeenCalled();
    expect(sw.activate).not.toHaveBeenCalled();
  });

  it("active la nouvelle version puis recharge, sur demande", async () => {
    const service = create();
    sw.announce("prete");

    await service.reloadVersion();

    expect(sw.activate).toHaveBeenCalledOnce();
    expect(reload).toHaveBeenCalledOnce();
    expect(sw.activate.mock.invocationCallOrder[0]).toBeLessThan(
      reload.mock.invocationCallOrder[0]!,
    );
  });

  it("recharge même si l’activation échoue", async () => {
    // le rechargement suffit à servir la version prête : un échec de l'activation ne doit pas laisser le bouton sans effet
    sw.activate.mockRejectedValue(new Error("échec"));
    const service = create();
    sw.announce("prete");

    await service.reloadVersion();

    expect(reload).toHaveBeenCalledOnce();
  });

  it("se dit perdue quand le service worker ne peut plus servir la version", () => {
    const service = create();
    sw.announce("perdue");
    expect(service.state()).toBe("perdue");
  });

  it("reste perdue si une nouvelle version devient prête ensuite", () => {
    // le défaut le plus grave garde la parole : c'est lui qu'il faut expliquer
    const service = create();
    sw.announce("perdue");
    sw.announce("prete");
    expect(service.state()).toBe("perdue");
  });

  it("ne recharge pas d’elle-même une version perdue — RG-version-perdue-signalee", async () => {
    const service = create();
    sw.announce("perdue");
    expect(reload).not.toHaveBeenCalled();

    await service.reloadVersion();
    // rien à activer : seule la version publiée peut encore être servie
    expect(sw.activate).not.toHaveBeenCalled();
    expect(reload).toHaveBeenCalledOnce();
  });

  it("vérifie au retour au premier plan", () => {
    create();
    returnToForeground();
    expect(sw.check).toHaveBeenCalledOnce();
  });

  it("ne vérifie pas quand la fenêtre passe à l’arrière-plan", () => {
    create();
    Object.defineProperty(document, "visibilityState", {
      value: "hidden",
      configurable: true,
    });
    document.dispatchEvent(new Event("visibilitychange"));
    expect(sw.check).not.toHaveBeenCalled();
  });

  it("vérifie toutes les heures", () => {
    vi.useFakeTimers();
    create();

    vi.advanceTimersByTime(CHECK_INTERVAL - 1);
    expect(sw.check).not.toHaveBeenCalled();

    vi.advanceTimersByTime(1);
    expect(sw.check).toHaveBeenCalledOnce();

    vi.advanceTimersByTime(CHECK_INTERVAL);
    expect(sw.check).toHaveBeenCalledTimes(2);
  });

  it("se tait quand une vérification échoue hors ligne", async () => {
    sw.check.mockRejectedValue(new Error("Failed to fetch"));
    const service = create();

    await expect(service.checkVersion()).resolves.toBeUndefined();
    expect(service.state()).toBe("courante");
  });

  it("cesse de vérifier une fois détruit", () => {
    vi.useFakeTimers();
    create();
    resetInjection();

    returnToForeground();
    vi.advanceTimersByTime(CHECK_INTERVAL);
    expect(sw.check).not.toHaveBeenCalled();
  });

  it("ne fait rien quand le service worker est désactivé", () => {
    // le cas du serveur de développement, où la version web n'inscrit pas de service worker
    sw.active = false;
    vi.useFakeTimers();
    const service = create();

    returnToForeground();
    vi.advanceTimersByTime(CHECK_INTERVAL);
    expect(sw.check).not.toHaveBeenCalled();
    expect(service.state()).toBe("courante");
  });

  describe("sur le bureau", () => {
    beforeEach(() => {
      sw.relaunches = true;
    });

    it("relance par l’annonceur, sans recharger la page", async () => {
      const service = create();
      sw.announce("prete");

      await service.reloadVersion();

      expect(sw.activate).toHaveBeenCalledOnce();
      // la relance remplace la fenêtre : recharger la page avant n'aurait servi que l'ancienne version
      expect(reload).not.toHaveBeenCalled();
    });

    it("dit que l’installation a échoué, et garde la version prête", async () => {
      sw.activate.mockRejectedValue("installation-echouee");
      const service = create();
      sw.announce("prete");

      await service.reloadVersion();

      expect(service.cause()).toBe("installation-echouee");
      expect(service.state()).toBe("prete");
      expect(reload).not.toHaveBeenCalled();
    });

    it("dit pourquoi aucune version n’est annoncée — RG-nouvelle-version-proposee", () => {
      const service = create();
      expect(service.cause()).toBeNull();

      // une cause que seul le livrable connaît : le service la relaie sans la lire
      const cause = "une-cause-du-livrable" as NoVersionCause;
      sw.sayCause(cause);
      expect(service.cause()).toBe(cause);
      expect(service.state()).toBe("courante");

      sw.sayCause(null);
      expect(service.cause()).toBeNull();
    });
  });

  it("se passe d’un service worker absent", () => {
    // jsdom n'a pas de service worker : la plateforme web par défaut n'a rien à annoncer
    provide(RELOAD_PAGE, reload);
    expect(inject(VersionService).state()).toBe("courante");
  });
});

describe("estUrlDeSaisie", () => {
  it.each([
    "/ssk-it/ssk-canon/cadrages/nouveau",
    "/ssk-it/ssk-canon/cadrages/2026-049/editer",
    "/ssk-it/ssk-canon/cadrages/2026-049/editer?onglet=decisions",
    "/ssk-it/ssk-canon/reglages",
  ])("reconnaît une page de saisie : %s", (url) => {
    expect(isInputUrl(url)).toBe(true);
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
    expect(isInputUrl(url)).toBe(false);
  });
});
