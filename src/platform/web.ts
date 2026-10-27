import type { VersionAnnouncement, VersionAnnouncer, Platform } from "./ports";
import {
  BrowserAuthenticator,
  BrowserSealedVault,
  browserKeyChannel,
} from "./web-sealing";

/** Skanon's service worker script, emitted by `tools/pwa/pwa.ts` in the web version only. */
export const SCRIPT_SERVICE_WORKER = "/sw.js";

/** What the service worker tells the page: a file of the current version is no longer served (`tools/pwa/sw.js`). */
export const VERSION_LOST_MESSAGE = "VERSION_PERDUE";

/** What the page asks of the waiting service worker: serve right now. */
export const ACTIVATE_MESSAGE = "SKIP_WAITING";

/** The longest the service worker change is awaited before reloading anyway. */
const ACTIVATION_DELAY = 3000;

/**
 * Versions, learned from the service worker (RG-nouvelle-version-proposee, RG-version-perdue-signalee).
 *
 * A version is ready when a new service worker has finished installing — everything it will serve is then cached — and another one still serves this page: the first installation is not a new version, and a version still downloading is not ready, since reloading would still serve the old one.
 *
 * An announcement made before anyone listens — registration precedes mounting the shell — is replayed to whoever listens afterwards.
 */
export class ServiceWorkerAnnouncer implements VersionAnnouncer {
  readonly active: boolean;
  /** The ready version is served by reloading the page, not by a relaunch. */
  readonly relaunches = false;
  private readonly listeners = new Set<(a: VersionAnnouncement) => void>();
  private readonly made = new Set<VersionAnnouncement>();

  /** Registers the service worker, once the page has loaded, and listens to what it announces. */
  static register(
    container: ServiceWorkerContainer | undefined,
    script = SCRIPT_SERVICE_WORKER,
  ): ServiceWorkerAnnouncer {
    if (!container) return new ServiceWorkerAnnouncer(undefined, script, null);
    const registration = afterLoad().then(() =>
      container.register(script, { scope: "/", updateViaCache: "none" }),
    );
    const announcer = new ServiceWorkerAnnouncer(
      container,
      script,
      registration,
    );
    container.addEventListener("message", (e: MessageEvent) => {
      if ((e.data as { type?: unknown } | null)?.type === VERSION_LOST_MESSAGE)
        announcer.announce("perdue");
    });
    registration.then(
      (r) => announcer.track(r),
      // Registration refused — private browsing, blocked storage: the application works without it, and without offline mode.
      () => {},
    );
    return announcer;
  }

  private constructor(
    private readonly container: ServiceWorkerContainer | undefined,
    private readonly script: string,
    private readonly registration: Promise<ServiceWorkerRegistration> | null,
  ) {
    this.active = !!container;
  }

  listen(onAnnouncement: (a: VersionAnnouncement) => void): () => void {
    this.listeners.add(onAnnouncement);
    for (const a of this.made) onAnnouncement(a);
    return () => this.listeners.delete(onAnnouncement);
  }

  /** The service worker does not say why it found nothing: there is nothing to explain. */
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
   * True when a version of Skanon already serves this page. Under the former application's service worker, or without any, the one installing does not replace a version of Skanon: there is nothing to offer.
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

/** Registration waits for the end of loading: precaching does not compete with the first page for bandwidth. */
function afterLoad(): Promise<void> {
  if (document.readyState === "complete") return Promise.resolve();
  return new Promise((end) =>
    window.addEventListener("load", () => end(), { once: true }),
  );
}

/**
 * The service worker is only registered in the built web version: the development server publishes none, tests have none, and the desktop application has no use for it.
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
  // A single object for both ports: sealing decides what the vault writes.
  const vault = new BrowserSealedVault(
    new BrowserAuthenticator(),
    browserKeyChannel(),
  );
  return {
    target: "web",
    vault,
    sealing: vault,
    // The page cannot talk Git to the platform: it reads through the API.
    contentSource: null,
    opener: {
      async open(url) {
        window.open(url, "_blank", "noopener");
      },
    },
    // The web version receives its links through the address itself (`/lien?…`): nothing to listen to.
    links: { async listen() {} },
    version: ServiceWorkerAnnouncer.register(serviceWorkerAvailable()),
    // The site is redeployed on every merge, without a number: the built commit designates it (`vite.config.ts`).
    loadVersion: async () => import.meta.env.VITE_VERSION,
    // The browser draws its own window around the page.
    titleBar: null,
  };
}
