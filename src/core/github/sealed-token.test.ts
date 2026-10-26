import { flushPromises } from "@vue/test-utils";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { inject, provide } from "../injection";
import { PLATFORM } from "../../platform/platform-token";
import { createWebPlatform } from "../../platform/web";
import { BrowserSealedVault } from "../../platform/web-sealing";
import { FakeAuthenticator } from "../../platform/authenticator-testing";
import { FakeKeyChannel, FakeKeyHub } from "../../platform/key-channel-testing";
import { ContentCache } from "../repo/content-cache";
import { TokenService } from "./token.service";

const TOKEN = "github_pat_11AAAAAAA0secretdurouge";
const OTHER = "ghp_autrejetondelorganisationacme";

/** Everything the browser keeps for the origin, in one block. */
function storage(): string {
  return Object.keys(localStorage)
    .map((k) => `${k}=${localStorage.getItem(k)}`)
    .join("\n");
}

/** The web version, whose passkey is simulated; `channel`, the tab's link to the other open tabs. */
function onTheWeb(auth: FakeAuthenticator, channel?: FakeKeyChannel): void {
  const vault = new BrowserSealedVault(auth, channel);
  provide(PLATFORM, { ...createWebPlatform(), vault, sealing: vault });
}

/** A tab among others, on the same storage: its service, and its end of the channel. */
async function openTab(
  auth: FakeAuthenticator,
  hub: FakeKeyHub,
): Promise<{ service: TokenService; channel: FakeKeyChannel }> {
  const { resetInjection } = await import("../injection");
  resetInjection();
  const channel = hub.open();
  onTheWeb(auth, channel);
  const service = inject(TokenService);
  await service.initialize();
  return { service, channel };
}

/** Lets the messages between tabs, and the work they trigger, arrive. */
async function settle(): Promise<void> {
  for (let i = 0; i < 5; i++) await new Promise((r) => setTimeout(r, 0));
}

/** A new tab: a fresh service on the same storage. */
async function reopen(auth: FakeAuthenticator): Promise<TokenService> {
  const { resetInjection } = await import("../injection");
  resetInjection();
  onTheWeb(auth);
  const service = inject(TokenService);
  await service.initialize();
  return service;
}

/**
 * The web version's token behind a passkey (RG-secret-conserve-localement, RG-protection-du-jeton-par-projet).
 */
describe("the token kept under a passkey", () => {
  let auth: FakeAuthenticator;
  let service: TokenService;

  beforeEach(async () => {
    localStorage.clear();
    auth = new FakeAuthenticator();
    onTheWeb(auth);
    service = inject(TokenService);
    await service.initialize();
  });

  it("says the token is kept in plain text as long as nothing is protected", () => {
    service.set(TOKEN);
    expect(service.form()).toBe("en-clair");
  });

  it("protects the tokens in place, and leaves only the ciphertext", async () => {
    service.set(TOKEN);
    service.setForScope("acme", OTHER);
    await flushPromises();
    expect(await service.protect()).toBe("scelle");
    expect(service.form()).toBe("scelle");
    expect(storage()).not.toContain(TOKEN);
    expect(storage()).not.toContain(OTHER);
  });

  it("reopens locked, without a token, then through the passkey", async () => {
    service.set(TOKEN);
    await flushPromises();
    await service.protect();

    const tab = await reopen(auth);
    expect(tab.locked()).toBe(true);
    expect(tab.present()).toBe(false);
    expect(tab.form()).toBe("scelle");

    expect(await tab.unlock()).toBe("ouvert");
    expect(tab.locked()).toBe(false);
    expect(tab.value()).toBe(TOKEN);
  });

  it("stays locked when unlocking is cancelled, and says so", async () => {
    service.set(TOKEN);
    await flushPromises();
    await service.protect();
    const tab = await reopen(auth);
    auth.cancel = true;
    expect(await tab.unlock()).toBe("annule");
    expect(tab.locked()).toBe(true);
    expect(tab.passkeyFailure()).toBe("annule");
  });

  // 2026-065 decision 02: the passkey is offered, never forced on load.
  it("never asks for the passkey by itself when the tab opens", async () => {
    service.set(TOKEN);
    await flushPromises();
    await service.protect();
    const evaluations = auth.evaluations;
    const tab = await reopen(auth);
    await settle();
    expect(tab.locked()).toBe(true);
    expect(auth.evaluations).toBe(evaluations);
  });

  it("opens through the passkey the browser's autofill offers", async () => {
    service.set(TOKEN);
    await flushPromises();
    await service.protect();
    const tab = await reopen(auth);
    expect(await tab.canOffer()).toBe(true);
    const offer = tab.offerUnlock(new AbortController().signal);
    await auth.pick();
    expect(await offer).toBe("ouvert");
    expect(tab.value()).toBe(TOKEN);
    expect(tab.locked()).toBe(false);
  });

  it("says nothing of an offer withdrawn before anyone picked the passkey", async () => {
    service.set(TOKEN);
    await flushPromises();
    await service.protect();
    const tab = await reopen(auth);
    const abort = new AbortController();
    const offer = tab.offerUnlock(abort.signal);
    abort.abort();
    expect(await offer).toBe("annule");
    expect(tab.passkeyFailure()).toBeNull();
  });

  it("keeps sealed a token entered once opened", async () => {
    service.set(TOKEN);
    await flushPromises();
    await service.protect();
    service.setForScope("acme", OTHER);
    await flushPromises();
    expect(storage()).not.toContain(OTHER);
    const tab = await reopen(auth);
    await tab.unlock();
    tab.targetRepo({ owner: "acme", repo: "x" });
    expect(tab.value()).toBe(OTHER);
  });

  it("protects a token on entry without ever writing it in plain text", async () => {
    const writes: string[] = [];
    const write = localStorage.setItem.bind(localStorage);
    vi.spyOn(localStorage, "setItem").mockImplementation((k, v) => {
      writes.push(v);
      write(k, v);
    });
    expect(await service.setProtected("", TOKEN)).toBe("scelle");
    expect(writes.join("\n")).not.toContain(TOKEN);
    expect(service.value()).toBe(TOKEN);
    vi.restoreAllMocks();
  });

  it("keeps in plain text, and says so, a token whose protection is cancelled on a project that offers it", async () => {
    auth.cancel = true;
    expect(await service.setProtected("", TOKEN)).toBe("annule");
    await flushPromises();
    expect(service.form()).toBe("en-clair");
    expect(service.passkeyFailure()).toBe("annule");
    expect(storage()).toContain(TOKEN);
  });

  it("erases the sealed store with the tokens", async () => {
    service.set(TOKEN);
    await flushPromises();
    await service.protect();
    service.erase();
    await flushPromises();
    expect(service.form()).toBe("en-clair");
    expect(service.locked()).toBe(false);
    expect(localStorage.getItem("skanon.jetons-scelles")).toBeNull();
  });
});

describe("the project that requires the passkey", () => {
  let auth: FakeAuthenticator;
  let service: TokenService;

  beforeEach(async () => {
    localStorage.clear();
    auth = new FakeAuthenticator();
    onTheWeb(auth);
    service = inject(TokenService);
    await service.initialize();
  });

  it("removes from the browser the token kept in plain text, without taking it from the tab", async () => {
    service.set(TOKEN);
    await flushPromises();
    service.requireProtection("exigee");
    await flushPromises();
    expect(storage()).not.toContain(TOKEN);
    expect(service.value()).toBe(TOKEN);
    expect(service.form()).toBe("session");
  });

  it("never writes in plain text a token entered afterwards", async () => {
    service.requireProtection("exigee");
    service.set(OTHER);
    await flushPromises();
    expect(storage()).not.toContain(OTHER);
    expect(service.value()).toBe(OTHER);
  });

  it("keeps only for the tab a token whose protection is cancelled", async () => {
    service.requireProtection("exigee");
    auth.cancel = true;
    expect(await service.setProtected("", TOKEN)).toBe("annule");
    await flushPromises();
    expect(storage()).not.toContain(TOKEN);
    expect(service.value()).toBe(TOKEN);
    expect(service.form()).toBe("session");
  });

  it("keeps the token protected once the passkey is created", async () => {
    service.set(TOKEN);
    service.requireProtection("exigee");
    expect(await service.protect()).toBe("scelle");
    expect(service.form()).toBe("scelle");
    const tab = await reopen(auth);
    expect(tab.locked()).toBe(true);
  });

  it("follows the most demanding of the projects open in the tab", async () => {
    // a token may open several: we do not keep in plain text, for one, what the other asked to protect
    service.requireProtection("exigee");
    service.requireProtection("proposee");
    service.set(TOKEN);
    await flushPromises();
    expect(storage()).not.toContain(TOKEN);
    expect(service.form()).toBe("session");
  });

  it("requires nothing more on the desktop, whose system vault is enough", async () => {
    const { resetInjection } = await import("../injection");
    resetInjection();
    const vault = {
      loadTokens: vi.fn(async () => ({ general: TOKEN, byScope: [] })),
      saveTokens: vi.fn(async () => "faite" as const),
      deleteTokens: vi.fn(async () => "faite" as const),
    };
    provide(PLATFORM, {
      ...createWebPlatform(),
      target: "bureau",
      vault,
      sealing: null,
    });
    const desktop = inject(TokenService);
    await desktop.initialize();
    desktop.requireProtection("exigee");
    await flushPromises();
    expect(vault.deleteTokens).not.toHaveBeenCalled();
    expect(desktop.form()).toBe("systeme");
  });
});

// 2026-065 decision 01: one unlock while a tab of the application stays open.
describe("the tokens unlocked once for the open tabs", () => {
  let auth: FakeAuthenticator;
  let hub: FakeKeyHub;

  beforeEach(() => {
    localStorage.clear();
    auth = new FakeAuthenticator();
    hub = new FakeKeyHub();
  });

  it("opens a new tab from a tab already unlocked, without the passkey", async () => {
    const { service: first } = await openTab(auth, hub);
    first.set(TOKEN);
    await flushPromises();
    await first.protect();
    const evaluations = auth.evaluations;

    const { service: second } = await openTab(auth, hub);
    expect(second.locked()).toBe(false);
    expect(second.value()).toBe(TOKEN);
    expect(auth.evaluations).toBe(evaluations);
  });

  it("opens the other tabs when one is unlocked", async () => {
    const { service: first, channel } = await openTab(auth, hub);
    first.set(TOKEN);
    await flushPromises();
    await first.protect();
    hub.close(channel);

    const { service: a } = await openTab(auth, hub);
    const { service: b } = await openTab(auth, hub);
    expect(b.locked()).toBe(true);
    await a.unlock();
    await settle();
    expect(b.locked()).toBe(false);
    expect(b.value()).toBe(TOKEN);
  });
});

// 2026-065 decision 03, RG-protection-du-jeton-par-projet: the author's preference yields to a project that requires the passkey.
describe("the preference to do without the passkey", () => {
  let auth: FakeAuthenticator;
  let service: TokenService;

  beforeEach(async () => {
    localStorage.clear();
    auth = new FakeAuthenticator();
    onTheWeb(auth);
    service = inject(TokenService);
    await service.initialize();
    service.set(TOKEN);
    await flushPromises();
  });

  it("proposes protecting a token by default, and no longer once the author opts out", async () => {
    expect(service.protectByDefault()).toBe(true);
    await service.optOut(true);
    expect(service.optedOut()).toBe(true);
    expect(service.protectByDefault()).toBe(false);
    expect((await reopen(auth)).optedOut()).toBe(true);
  });

  it("returns protected tokens to plain text, and says so", async () => {
    await service.protect();
    await service.optOut(true);
    expect(service.form()).toBe("en-clair");
    expect(storage()).toContain(TOKEN);
    expect(localStorage.getItem("skanon.jetons-scelles")).toBeNull();
  });

  it("changes nothing on a project that requires the passkey", async () => {
    await service.protect();
    service.requireProtection("exigee");
    await service.optOut(true);
    expect(service.protectByDefault()).toBe(true);
    expect(service.form()).toBe("scelle");
    expect(storage()).not.toContain(TOKEN);
  });
});

describe("private contents follow the token", () => {
  it("encrypts the cache once the tokens are opened, and stops encrypting it when they are forgotten", async () => {
    localStorage.clear();
    const auth = new FakeAuthenticator();
    onTheWeb(auth);
    const cache = inject(ContentCache);
    const encryptWith = vi.spyOn(cache, "encryptWith");
    const clearPrivate = vi.spyOn(cache, "clearPrivate");
    const service = inject(TokenService);
    await service.initialize();
    service.set(TOKEN);
    await flushPromises();

    await service.protect();
    // what the cache kept in plain text does not survive sealing
    expect(clearPrivate).toHaveBeenCalled();
    expect(encryptWith).toHaveBeenLastCalledWith(expect.anything());

    service.erase();
    expect(encryptWith).toHaveBeenLastCalledWith(null);
  });

  it("keeps the cache closed as long as the tokens are locked", async () => {
    localStorage.clear();
    const auth = new FakeAuthenticator();
    onTheWeb(auth);
    const service = inject(TokenService);
    await service.initialize();
    service.set(TOKEN);
    await flushPromises();
    await service.protect();

    const { resetInjection } = await import("../injection");
    resetInjection();
    onTheWeb(auth);
    const cache = inject(ContentCache);
    const lock = vi.spyOn(cache, "lock");
    const encryptWith = vi.spyOn(cache, "encryptWith");
    const tab = inject(TokenService);
    await tab.initialize();
    expect(lock).toHaveBeenCalled();
    await tab.unlock();
    expect(encryptWith).toHaveBeenLastCalledWith(expect.anything());
  });
});
