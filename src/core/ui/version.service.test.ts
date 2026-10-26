import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { PLATFORM } from "../../platform/platform-token";
import type { VersionAnnouncement, NoVersionCause } from "../../platform/ports";
import { createWebPlatform } from "../../platform/web";
import { inject, provide, resetInjection } from "../injection";
import {
  CHECK_INTERVAL,
  RELOAD_PAGE,
  VersionService,
  isInputUrl,
} from "./version.service";

/**
 * A simulated announcer, in place of the service worker: what it announces, and the two calls made to it. The real one does not run under jsdom, and would only run anyway with a version deployed next to it.
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
    // the property defined by returnToForeground hid jsdom's
    delete (document as { visibilityState?: unknown }).visibilityState;
  });

  it("stays on the current version as long as nothing is announced", () => {
    expect(create().state()).toBe("courante");
  });

  it("reports ready when a new version is downloaded", () => {
    const service = create();
    sw.announce("prete");
    expect(service.state()).toBe("prete");
  });

  it("ignores the steps that precede the ready version", () => {
    // Skanon's service worker only announces the installed version, ready to serve: a detected version, still downloading, does not cross the port. Nothing is announced as long as it is not ready.
    const service = create();
    expect(service.state()).toBe("courante");
  });

  it("never reloads by itself — RG-nouvelle-version-proposee", () => {
    create();
    sw.announce("prete");
    expect(reload).not.toHaveBeenCalled();
    expect(sw.activate).not.toHaveBeenCalled();
  });

  it("activates the new version then reloads, on request", async () => {
    const service = create();
    sw.announce("prete");

    await service.reloadVersion();

    expect(sw.activate).toHaveBeenCalledOnce();
    expect(reload).toHaveBeenCalledOnce();
    expect(sw.activate.mock.invocationCallOrder[0]).toBeLessThan(
      reload.mock.invocationCallOrder[0]!,
    );
  });

  it("reloads even if activation fails", async () => {
    // reloading is enough to serve the ready version: a failed activation must not leave the button without effect
    sw.activate.mockRejectedValue(new Error("échec"));
    const service = create();
    sw.announce("prete");

    await service.reloadVersion();

    expect(reload).toHaveBeenCalledOnce();
  });

  it("reports lost when the service worker can no longer serve the version", () => {
    const service = create();
    sw.announce("perdue");
    expect(service.state()).toBe("perdue");
  });

  it("stays lost if a new version becomes ready afterwards", () => {
    // the most serious defect keeps the floor: it is the one that needs explaining
    const service = create();
    sw.announce("perdue");
    sw.announce("prete");
    expect(service.state()).toBe("perdue");
  });

  it("does not reload a lost version by itself — RG-version-perdue-signalee", async () => {
    const service = create();
    sw.announce("perdue");
    expect(reload).not.toHaveBeenCalled();

    await service.reloadVersion();
    // nothing to activate: only the published version can still be served
    expect(sw.activate).not.toHaveBeenCalled();
    expect(reload).toHaveBeenCalledOnce();
  });

  it("checks on return to the foreground", () => {
    create();
    returnToForeground();
    expect(sw.check).toHaveBeenCalledOnce();
  });

  it("does not check when the window goes to the background", () => {
    create();
    Object.defineProperty(document, "visibilityState", {
      value: "hidden",
      configurable: true,
    });
    document.dispatchEvent(new Event("visibilitychange"));
    expect(sw.check).not.toHaveBeenCalled();
  });

  it("checks every hour", () => {
    vi.useFakeTimers();
    create();

    vi.advanceTimersByTime(CHECK_INTERVAL - 1);
    expect(sw.check).not.toHaveBeenCalled();

    vi.advanceTimersByTime(1);
    expect(sw.check).toHaveBeenCalledOnce();

    vi.advanceTimersByTime(CHECK_INTERVAL);
    expect(sw.check).toHaveBeenCalledTimes(2);
  });

  it("stays silent when a check fails offline", async () => {
    sw.check.mockRejectedValue(new Error("Failed to fetch"));
    const service = create();

    await expect(service.checkVersion()).resolves.toBeUndefined();
    expect(service.state()).toBe("courante");
  });

  it("stops checking once destroyed", () => {
    vi.useFakeTimers();
    create();
    resetInjection();

    returnToForeground();
    vi.advanceTimersByTime(CHECK_INTERVAL);
    expect(sw.check).not.toHaveBeenCalled();
  });

  it("does nothing when the service worker is disabled", () => {
    // the development server's case, where the web version registers no service worker
    sw.active = false;
    vi.useFakeTimers();
    const service = create();

    returnToForeground();
    vi.advanceTimersByTime(CHECK_INTERVAL);
    expect(sw.check).not.toHaveBeenCalled();
    expect(service.state()).toBe("courante");
  });

  describe("on the desktop", () => {
    beforeEach(() => {
      sw.relaunches = true;
    });

    it("relaunches through the announcer, without reloading the page", async () => {
      const service = create();
      sw.announce("prete");

      await service.reloadVersion();

      expect(sw.activate).toHaveBeenCalledOnce();
      // the relaunch replaces the window: reloading the page first would only have served the old version
      expect(reload).not.toHaveBeenCalled();
    });

    it("says the installation failed, and keeps the version ready", async () => {
      sw.activate.mockRejectedValue("installation-echouee");
      const service = create();
      sw.announce("prete");

      await service.reloadVersion();

      expect(service.cause()).toBe("installation-echouee");
      expect(service.state()).toBe("prete");
      expect(reload).not.toHaveBeenCalled();
    });

    it("says why no version is announced — RG-nouvelle-version-proposee", () => {
      const service = create();
      expect(service.cause()).toBeNull();

      // a cause only the deliverable knows: the service relays it without reading it
      const cause = "une-cause-du-livrable" as NoVersionCause;
      sw.sayCause(cause);
      expect(service.cause()).toBe(cause);
      expect(service.state()).toBe("courante");

      sw.sayCause(null);
      expect(service.cause()).toBeNull();
    });
  });

  it("does without an absent service worker", () => {
    // jsdom has no service worker: the default web platform has nothing to announce
    provide(RELOAD_PAGE, reload);
    expect(inject(VersionService).state()).toBe("courante");
  });
});

describe("isInputUrl", () => {
  it.each([
    "/ssk-it/ssk-canon/cadrages/nouveau",
    "/ssk-it/ssk-canon/cadrages/2026-049/editer",
    "/ssk-it/ssk-canon/cadrages/2026-049/editer?onglet=decisions",
    "/ssk-it/ssk-canon/reglages",
  ])("recognises an input page: %s", (url) => {
    expect(isInputUrl(url)).toBe(true);
  });

  it.each([
    "/",
    "/ssk-it/ssk-canon/referentiel",
    "/ssk-it/ssk-canon/cadrages",
    "/ssk-it/ssk-canon/cadrages/2026-049",
    "/ssk-it/ssk-canon/cadrages/2026-049#01-recharger-ou-proposer",
    // a repo named like a view does not make a reading page an input page
    "/ssk-it/reglages/referentiel",
  ])("does not mistake a reading page: %s", (url) => {
    expect(isInputUrl(url)).toBe(false);
  });
});
