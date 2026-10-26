import { PLATFORM } from "../../platform/platform-token";
import { INSTALLATION_FAILED, type NoVersionCause } from "../../platform/ports";
import { InjectionToken, inject, onDestroy } from "../injection";
import { signal } from "../signals";

/**
 * Where the version this window runs stands.
 *
 * `prete`: a more recent version is downloaded, and only awaits a reload. `perdue`: the service worker can no longer serve the current version, and a view loaded on demand may refuse to open.
 */
export type VersionState = "courante" | "prete" | "perdue";

/** One hour: the window that never leaves the screen must learn it too. */
export const CHECK_INTERVAL = 60 * 60 * 1000;

/**
 * The page reload, isolated so that tests can observe it: jsdom's is neither replaceable nor observable.
 */
export const RELOAD_PAGE = new InjectionToken<() => void>("RECHARGER_PAGE", {
  factory: () => () => document.location.reload(),
});

/** The views where the author holds an input that reloading would wipe. */
const INPUT_VIEWS = [
  /^cadrages\/nouveau$/,
  /^cadrages\/[^/]+\/editer$/,
  /^reglages$/,
];

/**
 * True when the address designates an input page.
 *
 * The banner uses it to warn, not to decide: it does not know whether the input has changed, and does not need to know it to warn that it would be lost.
 */
export function isInputUrl(url: string): boolean {
  // the first two segments are the organisation and the repo, never a view
  const view = (url.split(/[?#]/)[0] ?? "")
    .split("/")
    .filter(Boolean)
    .slice(2)
    .join("/");
  return INPUT_VIEWS.some((pattern) => pattern.test(view));
}

/**
 * The application's version — RG-nouvelle-version-proposee, RG-version-perdue-signalee.
 *
 * The service worker downloads a new version by itself, but only looks for it when a page loads, and only serves it on the next one. A window of the installed application, never reloaded, would therefore know nothing of it: this service asks for it, and says what it found. It asks the platform's announcer (`platform/ports.ts`): the service worker on the web, the native core on the desktop, which says why it announces nothing.
 *
 * It never reloads or relaunches by itself. A reload wipes the input in progress and the access obtained through a verified identity: only the author knows whether they can afford it now (2026-049, decision 01).
 */
export class VersionService {
  private readonly announcer = inject(PLATFORM).version;
  private readonly reloadPage = inject(RELOAD_PAGE);

  readonly state = signal<VersionState>("courante");

  /** Why no version is announced, as the announcer names it; the deliverable that knows it words it. `null` when the last check succeeded, and always on the web. */
  readonly cause = signal<NoVersionCause | null>(null);

  /** True when moving to the ready version relaunches the application: the banner says « relancer » rather than « recharger ». */
  readonly relaunches = this.announcer.relaunches;

  constructor() {
    if (!this.announcer.active) return;

    const stopCause = this.announcer.listenCause((cause) =>
      this.cause.set(cause),
    );

    const stop = this.announcer.listen((announcement) => {
      if (announcement === "perdue") this.state.set("perdue");
      // a lost version remains the message: it is the one that needs explaining
      else if (this.state() === "courante") this.state.set("prete");
    });

    // In the foreground for the window found again after a night, every hour for the one that never leaves the screen (2026-049, decision 02).
    const inForeground = () => {
      if (document.visibilityState === "visible") void this.checkVersion();
    };
    document.addEventListener("visibilitychange", inForeground);
    const timer = setInterval(() => void this.checkVersion(), CHECK_INTERVAL);

    onDestroy(() => {
      stop();
      stopCause();
      document.removeEventListener("visibilitychange", inForeground);
      clearInterval(timer);
    });
  }

  /**
   * Asks whether a more recent version exists.
   *
   * The answer arrives through the announcement, not through the result. A failure — offline, most often — is not an error to show: the next check will take over.
   */
  async checkVersion(): Promise<void> {
    try {
      await this.announcer.check();
    } catch {
      // nothing to say: see above
    }
  }

  /**
   * Moves to the published version, on the same address.
   *
   * A lost version has nothing to activate: only the published version can still be served, and reloading leads to it. An activation that fails does not hold back the reload: the button does not stay without effect, and the next check will find the ready version again.
   *
   * On the desktop, activation installs the version and relaunches the application: there is nothing to reload. An installation that fails is reported, and the version stays ready.
   */
  async reloadVersion(): Promise<void> {
    if (this.relaunches) {
      await this.relaunchVersion();
      return;
    }
    if (this.state() === "prete") {
      try {
        await this.announcer.activate();
      } catch {
        // see above
      }
    }
    this.reloadPage();
  }

  private async relaunchVersion(): Promise<void> {
    if (this.state() !== "prete") return;
    try {
      await this.announcer.activate();
    } catch {
      this.cause.set(INSTALLATION_FAILED);
    }
  }
}
