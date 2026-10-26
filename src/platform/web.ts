import type { VersionAnnouncement, VersionAnnouncer, Platform } from "./ports";
import { BrowserAuthenticator, BrowserSealedVault } from "./web-sealing";

/** Le script du service worker de Skanon, émis par `outils/pwa/pwa.ts` dans la seule version web. */
export const SCRIPT_SERVICE_WORKER = "/sw.js";

/** Ce que le service worker dit à la page : un fichier de la version en cours n'est plus servi (`outils/pwa/sw.js`). */
export const VERSION_LOST_MESSAGE = "VERSION_PERDUE";

/** Ce que la page demande au service worker en attente : servir dès maintenant. */
export const ACTIVATE_MESSAGE = "SKIP_WAITING";

/** Ce que l'on attend au plus le changement de service worker avant de recharger malgré tout. */
const ACTIVATION_DELAY = 3000;

/**
 * Les versions, apprises du service worker (RG-nouvelle-version-proposee, RG-version-perdue-signalee).
 *
 * Une version est prête quand un nouveau service worker a fini de s'installer — tout ce qu'il servira est alors en cache — et qu'un autre sert encore cette page : la première installation n'est pas une nouvelle version, et une version qui se télécharge encore n'est pas prête, puisque recharger servirait encore l'ancienne.
 *
 * Une annonce faite avant qu'on l'écoute — l'inscription précède le montage de la coquille — est rejouée à qui écoute ensuite.
 */
export class ServiceWorkerAnnouncer implements VersionAnnouncer {
  readonly active: boolean;
  /** La version prête sert au rechargement de la page, non à une relance. */
  readonly relaunches = false;
  private readonly registration: Promise<ServiceWorkerRegistration> | null;
  private readonly listeners = new Set<(a: VersionAnnouncement) => void>();
  private readonly made = new Set<VersionAnnouncement>();

  constructor(
    private readonly container: ServiceWorkerContainer | undefined,
    private readonly script = SCRIPT_SERVICE_WORKER,
  ) {
    this.active = !!container;
    if (!container) {
      this.registration = null;
      return;
    }
    container.addEventListener("message", (e: MessageEvent) => {
      if ((e.data as { type?: unknown } | null)?.type === VERSION_LOST_MESSAGE)
        this.announce("perdue");
    });
    this.registration = afterLoad().then(() =>
      container.register(script, { scope: "/", updateViaCache: "none" }),
    );
    this.registration.then(
      (r) => this.track(r),
      // Inscription refusée — navigation privée, stockage bloqué : l'application marche sans, et sans hors-ligne.
      () => {},
    );
  }

  listen(onAnnouncement: (a: VersionAnnouncement) => void): () => void {
    this.listeners.add(onAnnouncement);
    for (const a of this.made) onAnnouncement(a);
    return () => this.listeners.delete(onAnnouncement);
  }

  /** Le service worker ne dit pas pourquoi il n'a rien trouvé : il n'y a rien à expliquer. */
  listenCause(): () => void {
    return () => {};
  }

  async check(): Promise<void> {
    const r = await this.registration;
    await r?.update();
  }

  async activate(): Promise<void> {
    const container = this.container;
    const waiting = (await this.registration)?.waiting;
    if (!container || !waiting) return;
    const change = new Promise<void>((end) => {
      container.addEventListener("controllerchange", () => end(), {
        once: true,
      });
      setTimeout(end, ACTIVATION_DELAY);
    });
    waiting.postMessage({ type: ACTIVATE_MESSAGE });
    await change;
  }

  private track(r: ServiceWorkerRegistration): void {
    const onInstall = (w: ServiceWorker | null) => {
      if (!w) return;
      const check = () => {
        if (w.state === "installed" && this.servedBySkanon())
          this.announce("prete");
      };
      check();
      w.addEventListener("statechange", check);
    };
    if (r.waiting && this.servedBySkanon()) this.announce("prete");
    onInstall(r.installing);
    r.addEventListener("updatefound", () => onInstall(r.installing));
  }

  /**
   * Vrai quand une version de Skanon sert déjà cette page. Sous le service worker de l'ancienne application, ou sans aucun, celui qui s'installe ne remplace pas une version de Skanon : il n'y a rien à proposer.
   */
  private servedBySkanon(): boolean {
    const current = this.container?.controller?.scriptURL;
    return !!current && new URL(current).pathname === this.script;
  }

  private announce(a: VersionAnnouncement): void {
    if (this.made.has(a)) return;
    this.made.add(a);
    for (const e of this.listeners) e(a);
  }
}

/** L'inscription attend la fin du chargement : le préchargement ne dispute pas la bande passante à la première page. */
function afterLoad(): Promise<void> {
  if (document.readyState === "complete") return Promise.resolve();
  return new Promise((end) =>
    window.addEventListener("load", () => end(), { once: true }),
  );
}

/**
 * Le service worker n'est inscrit que dans la version web construite : le serveur de développement n'en publie pas, les tests n'en ont pas, et l'application de bureau n'en a pas l'usage.
 */
function serviceWorkerAvailable(): ServiceWorkerContainer | undefined {
  if (
    import.meta.env.VITE_TARGET !== "web" ||
    !import.meta.env.PROD ||
    typeof navigator === "undefined"
  )
    return undefined;
  return navigator.serviceWorker;
}

export function createWebPlatform(): Platform {
  // Un seul objet pour les deux ports : le scellement décide de ce que le coffre écrit.
  const vault = new BrowserSealedVault(new BrowserAuthenticator());
  return {
    target: "web",
    vault,
    sealing: vault,
    opener: {
      async open(url) {
        window.open(url, "_blank", "noopener");
      },
    },
    // La version web reçoit ses liens par l'adresse même (`/lien?…`) : rien à écouter.
    links: { async listen() {} },
    version: new ServiceWorkerAnnouncer(serviceWorkerAvailable()),
    // Le site se redéploie à chaque fusion, sans numéro : le commit construit le désigne (`vite.config.ts`).
    loadVersion: async () => import.meta.env.VITE_VERSION,
  };
}
