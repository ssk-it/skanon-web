import { beforeEach, describe, expect, it } from "vitest";
import type { JetonsStockes } from "./ports";
import { CoffreScelleDuNavigateur } from "./web-scellement";
import { FauxAuthentificateur } from "./authentificateur-testing";

const JETON = "github_pat_11AAAAAAA0secretdurouge";
const AUTRE = "ghp_autrejetondelorganisationacme";

const JETONS: JetonsStockes = {
  general: JETON,
  parPortee: [["acme", AUTRE]],
};

/** Tout ce que le navigateur garde pour l'origine, d'un bloc. */
function stockage(): string {
  return Object.keys(localStorage)
    .map((k) => `${k}=${localStorage.getItem(k)}`)
    .join("\n");
}

describe("le coffre du navigateur scellé par une passkey", () => {
  let auth: FauxAuthentificateur;

  beforeEach(() => {
    localStorage.clear();
    auth = new FauxAuthentificateur();
  });

  it("garde les jetons en clair tant que rien n’est scellé", async () => {
    const coffre = new CoffreScelleDuNavigateur(auth);
    expect(coffre.etat).toBe("aucun");
    expect(await coffre.saveJetons(JETONS)).toBe("faite");
    expect(await new CoffreScelleDuNavigateur(auth).loadJetons()).toEqual(
      JETONS,
    );
  });

  it("ne laisse dans le navigateur que le chiffré, une fois scellé", async () => {
    const coffre = new CoffreScelleDuNavigateur(auth);
    await coffre.saveJetons(JETONS);
    expect(await coffre.sealJetons(JETONS)).toBe("scelle");
    expect(coffre.etat).toBe("ouvert");
    // ni le jeton, ni sa fin, ni l'autre jeton : RG-secret-conserve-localement
    expect(stockage()).not.toContain(JETON);
    expect(stockage()).not.toContain(JETON.slice(-8));
    expect(stockage()).not.toContain(AUTRE);
  });

  it("se retrouve verrouillé au chargement suivant, et s’ouvre par la passkey", async () => {
    await new CoffreScelleDuNavigateur(auth).sealJetons(JETONS);

    const recharge = new CoffreScelleDuNavigateur(auth);
    expect(await recharge.loadJetons()).toEqual({
      general: null,
      parPortee: [],
    });
    expect(recharge.etat).toBe("verrouille");

    const ouvert = await recharge.unlockJetons();
    expect(ouvert).toEqual({ issue: "ouvert", jetons: JETONS });
    expect(recharge.etat).toBe("ouvert");
  });

  it("rescelle ce qu’on y écrit une fois ouvert", async () => {
    const coffre = new CoffreScelleDuNavigateur(auth);
    await coffre.sealJetons(JETONS);
    const suivants = { general: AUTRE, parPortee: [] };
    expect(await coffre.saveJetons(suivants)).toBe("faite");
    expect(stockage()).not.toContain(AUTRE);

    const recharge = new CoffreScelleDuNavigateur(auth);
    await recharge.loadJetons();
    expect(await recharge.unlockJetons()).toEqual({
      issue: "ouvert",
      jetons: suivants,
    });
  });

  it("refuse d’écrire tant qu’il est verrouillé, sans toucher au scellé", async () => {
    // écrire en clair à côté du scellé défairait la protection ; l'écraser perdrait les jetons scellés
    await new CoffreScelleDuNavigateur(auth).sealJetons(JETONS);
    const avant = stockage();
    const recharge = new CoffreScelleDuNavigateur(auth);
    await recharge.loadJetons();
    expect(await recharge.saveJetons({ general: AUTRE, parPortee: [] })).toBe(
      "refusee",
    );
    expect(stockage()).toBe(avant);
  });

  it("reste verrouillé quand le déverrouillage est annulé", async () => {
    await new CoffreScelleDuNavigateur(auth).sealJetons(JETONS);
    const recharge = new CoffreScelleDuNavigateur(auth);
    await recharge.loadJetons();
    auth.annuler = true;
    expect(await recharge.unlockJetons()).toEqual({ issue: "annule" });
    expect(recharge.etat).toBe("verrouille");
  });

  it("dit illisible un scellé que la clé rendue n’ouvre pas", async () => {
    await new CoffreScelleDuNavigateur(auth).sealJetons(JETONS);
    const recharge = new CoffreScelleDuNavigateur(auth);
    await recharge.loadJetons();
    auth.substituer = true;
    expect(await recharge.unlockJetons()).toEqual({ issue: "illisible" });
    expect(recharge.etat).toBe("verrouille");
  });

  it("ne change rien quand l’appareil ne rend pas de clé", async () => {
    const coffre = new CoffreScelleDuNavigateur(auth);
    await coffre.saveJetons(JETONS);
    auth.prfALaCreation = "absente";
    expect(await coffre.sealJetons(JETONS)).toBe("impossible");
    expect(coffre.etat).toBe("aucun");
    expect(await new CoffreScelleDuNavigateur(auth).loadJetons()).toEqual(
      JETONS,
    );
  });

  it("ne change rien quand la création est annulée", async () => {
    const coffre = new CoffreScelleDuNavigateur(auth);
    await coffre.saveJetons(JETONS);
    auth.annuler = true;
    expect(await coffre.sealJetons(JETONS)).toBe("annule");
    expect(coffre.etat).toBe("aucun");
    expect(stockage()).toContain(JETON);
  });

  it("demande la clé après coup au navigateur qui ne la rend pas à la création", async () => {
    auth.prfALaCreation = "differee";
    const coffre = new CoffreScelleDuNavigateur(auth);
    expect(await coffre.sealJetons(JETONS)).toBe("scelle");
    expect(auth.evaluations).toBe(1);
    const recharge = new CoffreScelleDuNavigateur(auth);
    await recharge.loadJetons();
    expect(await recharge.unlockJetons()).toEqual({
      issue: "ouvert",
      jetons: JETONS,
    });
  });

  it("efface le scellé comme le clair, et reprend la même passkey ensuite", async () => {
    // une passkey par scellement encombrerait le trousseau de l'utilisateur
    const coffre = new CoffreScelleDuNavigateur(auth);
    await coffre.sealJetons(JETONS);
    expect(await coffre.deleteJetons()).toBe("faite");
    expect(coffre.etat).toBe("aucun");
    expect(localStorage.getItem("skanon.jetons-scelles")).toBeNull();
    expect(await new CoffreScelleDuNavigateur(auth).loadJetons()).toEqual({
      general: null,
      parPortee: [],
    });

    expect(await coffre.sealJetons(JETONS)).toBe("scelle");
    expect(auth.creations).toBe(1);
  });

  it("crée une passkey neuve quand l’ancienne a disparu du trousseau", async () => {
    const coffre = new CoffreScelleDuNavigateur(auth);
    await coffre.sealJetons(JETONS);
    await coffre.deleteJetons();
    auth.secrets.clear();
    expect(await coffre.sealJetons(JETONS)).toBe("scelle");
    expect(auth.creations).toBe(2);
  });

  it("ne dit le scellement possible que si le navigateur le permet", async () => {
    expect(await new CoffreScelleDuNavigateur(auth).isPossible()).toBe(true);
    auth.possible = false;
    expect(await new CoffreScelleDuNavigateur(auth).isPossible()).toBe(false);
  });
});

describe("le chiffreur des contenus privés", () => {
  beforeEach(() => localStorage.clear());

  it("n’existe que tant que les jetons sont ouverts", async () => {
    const auth = new FauxAuthentificateur();
    const coffre = new CoffreScelleDuNavigateur(auth);
    expect(coffre.findChiffreur()).toBeNull();
    await coffre.sealJetons(JETONS);
    expect(coffre.findChiffreur()).not.toBeNull();

    const recharge = new CoffreScelleDuNavigateur(auth);
    await recharge.loadJetons();
    expect(recharge.findChiffreur()).toBeNull();
  });

  it("rouvre ce qu’il a scellé, d’un chargement à l’autre", async () => {
    const auth = new FauxAuthentificateur();
    const coffre = new CoffreScelleDuNavigateur(auth);
    await coffre.sealJetons(JETONS);
    const scelle = await coffre.findChiffreur()!.seal("règle privée");
    expect(scelle).not.toContain("règle");

    const recharge = new CoffreScelleDuNavigateur(auth);
    await recharge.loadJetons();
    await recharge.unlockJetons();
    expect(await recharge.findChiffreur()!.open(scelle)).toBe("règle privée");
  });

  it("rend null pour un scellé qu’il n’ouvre pas", async () => {
    const coffre = new CoffreScelleDuNavigateur(new FauxAuthentificateur());
    await coffre.sealJetons(JETONS);
    const chiffreur = coffre.findChiffreur()!;
    expect(await chiffreur.open("pas un scellé")).toBeNull();

    localStorage.clear();
    const autre = new CoffreScelleDuNavigateur(new FauxAuthentificateur());
    await autre.sealJetons(JETONS);
    expect(await chiffreur.open(await autre.findChiffreur()!.seal("x"))).toBe(
      null,
    );
  });
});
