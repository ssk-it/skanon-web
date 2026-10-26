import { beforeEach, describe, expect, it } from "vitest";
import type { StoredTokens } from "./ports";
import {
  BrowserSealedVault,
  readSealedText,
  writeSealedText,
} from "./web-scellement";
import { FakeAuthenticator } from "./authentificateur-testing";

const TOKEN = "github_pat_11AAAAAAA0secretdurouge";
const OTHER = "ghp_autrejetondelorganisationacme";

const TOKENS: StoredTokens = {
  general: TOKEN,
  byScope: [["acme", OTHER]],
};

/** Tout ce que le navigateur garde pour l'origine, d'un bloc. */
function storage(): string {
  return Object.keys(localStorage)
    .map((k) => `${k}=${localStorage.getItem(k)}`)
    .join("\n");
}

describe("le coffre du navigateur scellé par une passkey", () => {
  let auth: FakeAuthenticator;

  beforeEach(() => {
    localStorage.clear();
    auth = new FakeAuthenticator();
  });

  it("garde les jetons en clair tant que rien n’est scellé", async () => {
    const vault = new BrowserSealedVault(auth);
    expect(vault.state).toBe("aucun");
    expect(await vault.saveTokens(TOKENS)).toBe("faite");
    expect(await new BrowserSealedVault(auth).loadTokens()).toEqual(TOKENS);
  });

  it("ne laisse dans le navigateur que le chiffré, une fois scellé", async () => {
    const vault = new BrowserSealedVault(auth);
    await vault.saveTokens(TOKENS);
    expect(await vault.sealTokens(TOKENS)).toBe("scelle");
    expect(vault.state).toBe("ouvert");
    // ni le jeton, ni sa fin, ni l'autre jeton : RG-secret-conserve-localement
    expect(storage()).not.toContain(TOKEN);
    expect(storage()).not.toContain(TOKEN.slice(-8));
    expect(storage()).not.toContain(OTHER);
  });

  it("se retrouve verrouillé au chargement suivant, et s’ouvre par la passkey", async () => {
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

  it("rescelle ce qu’on y écrit une fois ouvert", async () => {
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

  it("refuse d’écrire tant qu’il est verrouillé, sans toucher au scellé", async () => {
    // écrire en clair à côté du scellé défairait la protection ; l'écraser perdrait les jetons scellés
    await new BrowserSealedVault(auth).sealTokens(TOKENS);
    const before = storage();
    const reloaded = new BrowserSealedVault(auth);
    await reloaded.loadTokens();
    expect(await reloaded.saveTokens({ general: OTHER, byScope: [] })).toBe(
      "refusee",
    );
    expect(storage()).toBe(before);
  });

  it("reste verrouillé quand le déverrouillage est annulé", async () => {
    await new BrowserSealedVault(auth).sealTokens(TOKENS);
    const reloaded = new BrowserSealedVault(auth);
    await reloaded.loadTokens();
    auth.cancel = true;
    expect(await reloaded.unlockTokens()).toEqual({ issue: "annule" });
    expect(reloaded.state).toBe("verrouille");
  });

  it("dit illisible un scellé que la clé rendue n’ouvre pas", async () => {
    await new BrowserSealedVault(auth).sealTokens(TOKENS);
    const reloaded = new BrowserSealedVault(auth);
    await reloaded.loadTokens();
    auth.substitute = true;
    expect(await reloaded.unlockTokens()).toEqual({ issue: "illisible" });
    expect(reloaded.state).toBe("verrouille");
  });

  it("ne change rien quand l’appareil ne rend pas de clé", async () => {
    const vault = new BrowserSealedVault(auth);
    await vault.saveTokens(TOKENS);
    auth.prfAtCreation = "absente";
    expect(await vault.sealTokens(TOKENS)).toBe("impossible");
    expect(vault.state).toBe("aucun");
    expect(await new BrowserSealedVault(auth).loadTokens()).toEqual(TOKENS);
  });

  it("ne change rien quand la création est annulée", async () => {
    const vault = new BrowserSealedVault(auth);
    await vault.saveTokens(TOKENS);
    auth.cancel = true;
    expect(await vault.sealTokens(TOKENS)).toBe("annule");
    expect(vault.state).toBe("aucun");
    expect(storage()).toContain(TOKEN);
  });

  it("demande la clé après coup au navigateur qui ne la rend pas à la création", async () => {
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

  it("efface le scellé comme le clair, et reprend la même passkey ensuite", async () => {
    // une passkey par scellement encombrerait le trousseau de l'utilisateur
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

  it("crée une passkey neuve quand l’ancienne a disparu du trousseau", async () => {
    const vault = new BrowserSealedVault(auth);
    await vault.sealTokens(TOKENS);
    await vault.deleteTokens();
    auth.secrets.clear();
    expect(await vault.sealTokens(TOKENS)).toBe("scelle");
    expect(auth.creations).toBe(2);
  });

  it("ne dit le scellement possible que si le navigateur le permet", async () => {
    expect(await new BrowserSealedVault(auth).isPossible()).toBe(true);
    auth.possible = false;
    expect(await new BrowserSealedVault(auth).isPossible()).toBe(false);
  });
});

describe("le chiffreur des contenus privés", () => {
  beforeEach(() => localStorage.clear());

  it("n’existe que tant que les jetons sont ouverts", async () => {
    const auth = new FakeAuthenticator();
    const vault = new BrowserSealedVault(auth);
    expect(vault.findCipher()).toBeNull();
    await vault.sealTokens(TOKENS);
    expect(vault.findCipher()).not.toBeNull();

    const reloaded = new BrowserSealedVault(auth);
    await reloaded.loadTokens();
    expect(reloaded.findCipher()).toBeNull();
  });

  it("rouvre ce qu’il a scellé, d’un chargement à l’autre", async () => {
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

  it("rend null pour un scellé qu’il n’ouvre pas", async () => {
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
 * Le texte qu'on scelle est un format stocké sur le poste : ses champs gardent les noms qu'il avait quand ils ont été écrits, quel que soit le nom des champs dans le code. Sinon, un rédacteur perdrait ses jetons scellés à la mise à jour.
 */
describe("le texte des jetons scellés", () => {
  it("relit ce que la version précédente a scellé", () => {
    expect(
      readSealedText(
        JSON.stringify({ general: TOKEN, parPortee: [["acme", OTHER]] }),
      ),
    ).toEqual(TOKENS);
  });

  it("écrit sous les mêmes noms qu'il relit", () => {
    expect(JSON.parse(writeSealedText(TOKENS))).toEqual({
      general: TOKEN,
      parPortee: [["acme", OTHER]],
    });
  });

  it("rend null sur un texte illisible", () => {
    expect(readSealedText("{")).toBeNull();
  });
});
