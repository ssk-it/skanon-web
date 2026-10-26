import { beforeEach, describe, expect, it } from "vitest";
import type { StoredTokens } from "./ports";
import {
  BrowserSealedVault,
  readSealedText,
  writeSealedText,
} from "./web-sealing";
import { FakeAuthenticator } from "./authenticator-testing";

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
