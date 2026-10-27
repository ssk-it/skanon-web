import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { StoredTokens } from "./ports";
import {
  BrowserAuthenticator,
  BrowserSealedVault,
  readSealedText,
  writeSealedText,
} from "./web-sealing";
import { FakeAuthenticator } from "./authenticator-testing";
import { FakeKeyHub } from "./key-channel-testing";

const TOKEN = "github_pat_11AAAAAAA0secretdurouge";
const OTHER = "ghp_autrejetondelorganisationacme";

const TOKENS: StoredTokens = {
  general: TOKEN,
  byScope: [["acme", OTHER]],
};

/** Everything the browser keeps for the origin, in one block. */
function storage(): string {
  return Object.keys(localStorage)
    .map((k) => `${k}=${localStorage.getItem(k)}`)
    .join("\n");
}

describe("the browser vault sealed by a passkey", () => {
  let auth: FakeAuthenticator;

  beforeEach(() => {
    localStorage.clear();
    auth = new FakeAuthenticator();
  });

  it("keeps the tokens in plain text as long as nothing is sealed", async () => {
    const vault = new BrowserSealedVault(auth);
    expect(vault.state).toBe("aucun");
    expect(await vault.saveTokens(TOKENS)).toBe("faite");
    expect(await new BrowserSealedVault(auth).loadTokens()).toEqual(TOKENS);
  });

  it("leaves only the ciphertext in the browser, once sealed", async () => {
    const vault = new BrowserSealedVault(auth);
    await vault.saveTokens(TOKENS);
    expect(await vault.sealTokens(TOKENS)).toBe("scelle");
    expect(vault.state).toBe("ouvert");
    // neither the token, nor its end, nor the other token: RG-secret-conserve-localement
    expect(storage()).not.toContain(TOKEN);
    expect(storage()).not.toContain(TOKEN.slice(-8));
    expect(storage()).not.toContain(OTHER);
  });

  it("is locked again at the next load, and opens through the passkey", async () => {
    await new BrowserSealedVault(auth).sealTokens(TOKENS);

    const reloaded = new BrowserSealedVault(auth);
    expect(await reloaded.loadTokens()).toEqual({
      general: null,
      byScope: [],
    });
    expect(reloaded.state).toBe("verrouille");

    const opened = await reloaded.unlockTokens();
    expect(opened).toEqual({ issue: "ouvert", tokens: TOKENS });
    expect(reloaded.state).toBe("ouvert");
  });

  it("reseals what is written to it once opened", async () => {
    const vault = new BrowserSealedVault(auth);
    await vault.sealTokens(TOKENS);
    const following = { general: OTHER, byScope: [] };
    expect(await vault.saveTokens(following)).toBe("faite");
    expect(storage()).not.toContain(OTHER);

    const reloaded = new BrowserSealedVault(auth);
    await reloaded.loadTokens();
    expect(await reloaded.unlockTokens()).toEqual({
      issue: "ouvert",
      tokens: following,
    });
  });

  it("refuses to write while locked, without touching the sealed store", async () => {
    // writing in plain text next to the sealed store would undo the protection; overwriting it would lose the sealed tokens
    await new BrowserSealedVault(auth).sealTokens(TOKENS);
    const before = storage();
    const reloaded = new BrowserSealedVault(auth);
    await reloaded.loadTokens();
    expect(await reloaded.saveTokens({ general: OTHER, byScope: [] })).toBe(
      "refusee",
    );
    expect(storage()).toBe(before);
  });

  it("stays locked when unlocking is cancelled", async () => {
    await new BrowserSealedVault(auth).sealTokens(TOKENS);
    const reloaded = new BrowserSealedVault(auth);
    await reloaded.loadTokens();
    auth.cancel = true;
    expect(await reloaded.unlockTokens()).toEqual({ issue: "annule" });
    expect(reloaded.state).toBe("verrouille");
  });

  it("reports unreadable a sealed store the returned key does not open", async () => {
    await new BrowserSealedVault(auth).sealTokens(TOKENS);
    const reloaded = new BrowserSealedVault(auth);
    await reloaded.loadTokens();
    auth.substitute = true;
    expect(await reloaded.unlockTokens()).toEqual({ issue: "illisible" });
    expect(reloaded.state).toBe("verrouille");
  });

  it("changes nothing when the device returns no key", async () => {
    const vault = new BrowserSealedVault(auth);
    await vault.saveTokens(TOKENS);
    auth.prfAtCreation = "absente";
    expect(await vault.sealTokens(TOKENS)).toBe("impossible");
    expect(vault.state).toBe("aucun");
    expect(await new BrowserSealedVault(auth).loadTokens()).toEqual(TOKENS);
  });

  it("changes nothing when creation is cancelled", async () => {
    const vault = new BrowserSealedVault(auth);
    await vault.saveTokens(TOKENS);
    auth.cancel = true;
    expect(await vault.sealTokens(TOKENS)).toBe("annule");
    expect(vault.state).toBe("aucun");
    expect(storage()).toContain(TOKEN);
  });

  it("asks for the key afterwards from the browser that does not return it at creation", async () => {
    auth.prfAtCreation = "differee";
    const vault = new BrowserSealedVault(auth);
    expect(await vault.sealTokens(TOKENS)).toBe("scelle");
    expect(auth.evaluations).toBe(1);
    const reloaded = new BrowserSealedVault(auth);
    await reloaded.loadTokens();
    expect(await reloaded.unlockTokens()).toEqual({
      issue: "ouvert",
      tokens: TOKENS,
    });
  });

  it("erases the sealed store like the plain one, and reuses the same passkey afterwards", async () => {
    // one passkey per sealing would clutter the user's keychain
    const vault = new BrowserSealedVault(auth);
    await vault.sealTokens(TOKENS);
    expect(await vault.deleteTokens()).toBe("faite");
    expect(vault.state).toBe("aucun");
    expect(localStorage.getItem("skanon.jetons-scelles")).toBeNull();
    expect(await new BrowserSealedVault(auth).loadTokens()).toEqual({
      general: null,
      byScope: [],
    });

    expect(await vault.sealTokens(TOKENS)).toBe("scelle");
    expect(auth.creations).toBe(1);
  });

  it("creates a fresh passkey when the old one has disappeared from the keychain", async () => {
    const vault = new BrowserSealedVault(auth);
    await vault.sealTokens(TOKENS);
    await vault.deleteTokens();
    auth.secrets.clear();
    expect(await vault.sealTokens(TOKENS)).toBe("scelle");
    expect(auth.creations).toBe(2);
  });

  it("reports sealing possible only if the browser allows it", async () => {
    expect(await new BrowserSealedVault(auth).isPossible()).toBe(true);
    auth.possible = false;
    expect(await new BrowserSealedVault(auth).isPossible()).toBe(false);
  });
});

/** Lets the messages between tabs, and the work they trigger, arrive. */
async function settle(): Promise<void> {
  for (let i = 0; i < 5; i++) await new Promise((r) => setTimeout(r, 0));
}

// RG-secret-conserve-localement, 2026-065 decision 01: one unlock while a tab of the application stays open, the key in memory only.
describe("the key shared between open tabs", () => {
  let auth: FakeAuthenticator;
  let hub: FakeKeyHub;

  beforeEach(() => {
    localStorage.clear();
    auth = new FakeAuthenticator();
    hub = new FakeKeyHub();
  });

  it("opens a new tab's tokens from a tab already unlocked, without the passkey", async () => {
    await new BrowserSealedVault(auth, hub.open()).sealTokens(TOKENS);
    const evaluations = auth.evaluations;

    const newTab = new BrowserSealedVault(auth, hub.open());
    expect(newTab.state).toBe("verrouille");
    expect(await newTab.joinOpenTabs()).toEqual({
      issue: "ouvert",
      tokens: TOKENS,
    });
    expect(newTab.state).toBe("ouvert");
    expect(auth.evaluations).toBe(evaluations);
    // the new tab can read the private contents too: RG-contenus-prives-au-repos
    expect(newTab.findCipher()).not.toBeNull();
  });

  it("stays locked when no open tab holds the key", async () => {
    const first = hub.open();
    await new BrowserSealedVault(auth, first).sealTokens(TOKENS);
    hub.close(first);

    const newTab = new BrowserSealedVault(auth, hub.open());
    expect(await newTab.joinOpenTabs()).toBeNull();
    expect(newTab.state).toBe("verrouille");
  });

  it("ignores a key that no longer opens its sealed store", async () => {
    await new BrowserSealedVault(auth, hub.open()).sealTokens(TOKENS);
    // sealed again elsewhere, under another key: the open tab's key is stale
    auth.substitute = true;
    await new BrowserSealedVault(auth).sealTokens(TOKENS);

    const newTab = new BrowserSealedVault(auth, hub.open());
    expect(await newTab.joinOpenTabs()).toBeNull();
    expect(newTab.state).toBe("verrouille");
  });

  it("opens the other locked tabs when one is unlocked", async () => {
    await new BrowserSealedVault(auth).sealTokens(TOKENS);
    const unlocked = new BrowserSealedVault(auth, hub.open());
    const waiting = new BrowserSealedVault(auth, hub.open());
    const opened: unknown[] = [];
    waiting.listenChanges((tokens) => opened.push(tokens));

    await unlocked.unlockTokens();
    await settle();

    expect(waiting.state).toBe("ouvert");
    expect(opened).toEqual([TOKENS]);
  });

  it("writes the key nowhere", async () => {
    await new BrowserSealedVault(auth, hub.open()).sealTokens(TOKENS);
    const before = storage();
    await new BrowserSealedVault(auth, hub.open()).joinOpenTabs();
    expect(storage()).toBe(before);
  });
});

// 2026-065 decision 02: the passkey is offered by the browser's autofill, never forced on load.
describe("the unlock offered by the browser's passkey autofill", () => {
  let auth: FakeAuthenticator;

  beforeEach(async () => {
    localStorage.clear();
    auth = new FakeAuthenticator();
    await new BrowserSealedVault(auth).sealTokens(TOKENS);
  });

  it("opens the tokens once the user picks the offered passkey", async () => {
    const vault = new BrowserSealedVault(auth);
    const offer = vault.offerUnlock(new AbortController().signal);
    expect(auth.offering).toBe(true);
    await auth.pick();
    expect(await offer).toEqual({ issue: "ouvert", tokens: TOKENS });
    expect(vault.state).toBe("ouvert");
  });

  it("withdraws the offer when it is aborted, and stays locked", async () => {
    const vault = new BrowserSealedVault(auth);
    const abort = new AbortController();
    const offer = vault.offerUnlock(abort.signal);
    abort.abort();
    expect(await offer).toEqual({ issue: "annule" });
    expect(auth.offering).toBe(false);
    expect(vault.state).toBe("verrouille");
  });

  it("reports unreadable a picked passkey that does not open the sealed store", async () => {
    const vault = new BrowserSealedVault(auth);
    const offer = vault.offerUnlock(new AbortController().signal);
    auth.substitute = true;
    await auth.pick();
    expect(await offer).toEqual({ issue: "illisible" });
    expect(vault.state).toBe("verrouille");
  });

  it("offers it only where the browser returns the key through autofill", async () => {
    expect(await new BrowserSealedVault(auth).canOffer()).toBe(true);
    auth.conditionalPossible = false;
    expect(await new BrowserSealedVault(auth).canOffer()).toBe(false);
  });
});

// 2026-065 decision 03: the author may do without the passkey, in this browser.
describe("the preference to do without the passkey", () => {
  let auth: FakeAuthenticator;

  beforeEach(() => {
    localStorage.clear();
    auth = new FakeAuthenticator();
  });

  it("is off by default, and kept from one load to the next", () => {
    expect(new BrowserSealedVault(auth).optedOut).toBe(false);
    expect(new BrowserSealedVault(auth).optOut(true)).toBe(true);
    expect(new BrowserSealedVault(auth).optedOut).toBe(true);
    new BrowserSealedVault(auth).optOut(false);
    expect(new BrowserSealedVault(auth).optedOut).toBe(false);
  });

  it("returns open tokens to plain text, and removes the sealed store", async () => {
    const vault = new BrowserSealedVault(auth);
    await vault.sealTokens(TOKENS);
    expect(await vault.unsealTokens(TOKENS)).toBe("faite");
    expect(vault.state).toBe("aucun");
    expect(localStorage.getItem("skanon.jetons-scelles")).toBeNull();
    expect(await new BrowserSealedVault(auth).loadTokens()).toEqual(TOKENS);
  });

  it("refuses to unseal tokens it cannot open", async () => {
    await new BrowserSealedVault(auth).sealTokens(TOKENS);
    const before = storage();
    const locked = new BrowserSealedVault(auth);
    expect(await locked.unsealTokens(TOKENS)).toBe("refusee");
    expect(storage()).toBe(before);
  });
});

describe("the private contents cipher", () => {
  beforeEach(() => localStorage.clear());

  it("only exists as long as the tokens are open", async () => {
    const auth = new FakeAuthenticator();
    const vault = new BrowserSealedVault(auth);
    expect(vault.findCipher()).toBeNull();
    await vault.sealTokens(TOKENS);
    expect(vault.findCipher()).not.toBeNull();

    const reloaded = new BrowserSealedVault(auth);
    await reloaded.loadTokens();
    expect(reloaded.findCipher()).toBeNull();
  });

  it("reopens what it sealed, from one load to the next", async () => {
    const auth = new FakeAuthenticator();
    const vault = new BrowserSealedVault(auth);
    await vault.sealTokens(TOKENS);
    const sealed = await vault.findCipher()!.seal("règle privée");
    expect(sealed).not.toContain("règle");

    const reloaded = new BrowserSealedVault(auth);
    await reloaded.loadTokens();
    await reloaded.unlockTokens();
    expect(await reloaded.findCipher()!.open(sealed)).toBe("règle privée");
  });

  it("returns null for a sealed text it does not open", async () => {
    const vault = new BrowserSealedVault(new FakeAuthenticator());
    await vault.sealTokens(TOKENS);
    const cipher = vault.findCipher()!;
    expect(await cipher.open("pas un scellé")).toBeNull();

    localStorage.clear();
    const other = new BrowserSealedVault(new FakeAuthenticator());
    await other.sealTokens(TOKENS);
    expect(await cipher.open(await other.findCipher()!.seal("x"))).toBe(null);
  });
});

/**
 * The text being sealed is a format stored on the machine: its fields keep the names they had when they were written, whatever the field names in the code. Otherwise, an author would lose their sealed tokens on update.
 */
describe("the sealed tokens text", () => {
  it("rereads what the previous version sealed", () => {
    expect(
      readSealedText(
        JSON.stringify({ general: TOKEN, parPortee: [["acme", OTHER]] }),
      ),
    ).toEqual(TOKENS);
  });

  it("writes under the same names it rereads", () => {
    expect(JSON.parse(writeSealedText(TOKENS))).toEqual({
      general: TOKEN,
      parPortee: [["acme", OTHER]],
    });
  });

  it("returns null on an unreadable text", () => {
    expect(readSealedText("{")).toBeNull();
  });
});

/**
 * What the browser records of the passkey it creates. Chrome lists, in the field where it offers the passkey, the passwords it keeps for the site — the GitHub token among them: the passkey's name must tell it apart (2026-065).
 */
describe("the passkey the browser creates", () => {
  let created: CredentialCreationOptions | undefined;
  let requested: CredentialRequestOptions | undefined;

  beforeEach(() => {
    created = undefined;
    requested = undefined;
    vi.stubGlobal("PublicKeyCredential", function PublicKeyCredential() {});
    vi.stubGlobal("navigator", {
      credentials: {
        create: (options: CredentialCreationOptions) => {
          created = options;
          return Promise.resolve(null);
        },
        get: (options: CredentialRequestOptions) => {
          requested = options;
          return Promise.resolve(null);
        },
      },
    });
  });

  afterEach(() => vi.unstubAllGlobals());

  it("is named for Skanon, apart from the GitHub tokens", async () => {
    await new BrowserAuthenticator().create(new Uint8Array(32));
    expect(created?.publicKey?.user.name).toBe("Skanon passkey");
    expect(created?.publicKey?.user.displayName).toBe("Skanon passkey");
  });

  // The browser's autofill only lists discoverable passkeys.
  it("is discoverable, so that the autofill can list it", async () => {
    await new BrowserAuthenticator().create(new Uint8Array(32));
    expect(created?.publicKey?.authenticatorSelection?.residentKey).toBe(
      "required",
    );
  });

  // Without naming the passkey, the browser shows its window listing the site's passkeys, as for an identity provider.
  it("asks the author to pick among the site's passkeys, in the browser's window", async () => {
    const salt = new Uint8Array(32);
    await new BrowserAuthenticator().choose(salt);
    expect(requested?.mediation).toBeUndefined();
    expect(requested?.publicKey?.allowCredentials).toBeUndefined();
    expect(requested?.publicKey?.userVerification).toBe("required");
    expect(requested?.publicKey?.extensions?.prf?.eval?.first).toBe(salt);
  });
});
