import { flushPromises } from "@vue/test-utils";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { inject, provide } from "../injection";
import { PLATEFORME } from "../../plateforme/jeton";
import { createPlateformeWeb } from "../../plateforme/web";
import { CoffreScelleDuNavigateur } from "../../plateforme/web-scellement";
import { FauxAuthentificateur } from "../../plateforme/authentificateur-testing";
import { ContenusCache } from "../repo/contenus-cache";
import { TokenService } from "./token.service";

const JETON = "github_pat_11AAAAAAA0secretdurouge";
const AUTRE = "ghp_autrejetondelorganisationacme";

/** Tout ce que le navigateur garde pour l'origine, d'un bloc. */
function stockage(): string {
  return Object.keys(localStorage)
    .map((k) => `${k}=${localStorage.getItem(k)}`)
    .join("\n");
}

/** La version web, dont la passkey est simulée. */
function surLeWeb(auth: FauxAuthentificateur): void {
  const coffre = new CoffreScelleDuNavigateur(auth);
  provide(PLATEFORME, { ...createPlateformeWeb(), coffre, scellement: coffre });
}

/** Un nouvel onglet : un service neuf sur le même stockage. */
async function rouvrir(auth: FauxAuthentificateur): Promise<TokenService> {
  const { resetInjection } = await import("../injection");
  resetInjection();
  surLeWeb(auth);
  const service = inject(TokenService);
  await service.initialiser();
  return service;
}

/**
 * Le jeton de la version web derrière une passkey (RG-secret-conserve-localement, RG-protection-du-jeton-par-projet).
 */
describe("le jeton gardé sous passkey", () => {
  let auth: FauxAuthentificateur;
  let service: TokenService;

  beforeEach(async () => {
    localStorage.clear();
    auth = new FauxAuthentificateur();
    surLeWeb(auth);
    service = inject(TokenService);
    await service.initialiser();
  });

  it("dit le jeton gardé en clair tant que rien n’est protégé", () => {
    service.definir(JETON);
    expect(service.forme()).toBe("en-clair");
  });

  it("protège les jetons en place, et n’en laisse que le chiffré", async () => {
    service.definir(JETON);
    service.definirPourPortee("acme", AUTRE);
    await flushPromises();
    expect(await service.proteger()).toBe("scelle");
    expect(service.forme()).toBe("scelle");
    expect(stockage()).not.toContain(JETON);
    expect(stockage()).not.toContain(AUTRE);
  });

  it("se rouvre verrouillé, sans jeton, puis par la passkey", async () => {
    service.definir(JETON);
    await flushPromises();
    await service.proteger();

    const onglet = await rouvrir(auth);
    expect(onglet.verrouille()).toBe(true);
    expect(onglet.present()).toBe(false);
    expect(onglet.forme()).toBe("scelle");

    expect(await onglet.deverrouiller()).toBe("ouvert");
    expect(onglet.verrouille()).toBe(false);
    expect(onglet.valeur()).toBe(JETON);
  });

  it("reste verrouillé quand le déverrouillage est annulé, et le dit", async () => {
    service.definir(JETON);
    await flushPromises();
    await service.proteger();
    const onglet = await rouvrir(auth);
    auth.annuler = true;
    expect(await onglet.deverrouiller()).toBe("annule");
    expect(onglet.verrouille()).toBe(true);
    expect(onglet.echecPasskey()).toBe("annule");
  });

  it("s’ouvre dès l’ouverture de l’onglet, sans attendre de clic", async () => {
    service.definir(JETON);
    await flushPromises();
    await service.proteger();
    const onglet = await rouvrir(auth);
    expect(await onglet.deverrouillerSansGeste()).toBe("ouvert");
    expect(onglet.valeur()).toBe(JETON);
  });

  it("ne dit rien d’un refus à l’ouverture de l’onglet : le navigateur a pu exiger un clic", async () => {
    service.definir(JETON);
    await flushPromises();
    await service.proteger();
    const onglet = await rouvrir(auth);
    auth.annuler = true;
    expect(await onglet.deverrouillerSansGeste()).toBe("annule");
    expect(onglet.verrouille()).toBe(true);
    expect(onglet.echecPasskey()).toBeNull();
  });

  it("garde scellé un jeton saisi une fois ouvert", async () => {
    service.definir(JETON);
    await flushPromises();
    await service.proteger();
    service.definirPourPortee("acme", AUTRE);
    await flushPromises();
    expect(stockage()).not.toContain(AUTRE);
    const onglet = await rouvrir(auth);
    await onglet.deverrouiller();
    onglet.cibler({ owner: "acme", repo: "x" });
    expect(onglet.valeur()).toBe(AUTRE);
  });

  it("protège un jeton à sa saisie sans jamais l’écrire en clair", async () => {
    const ecritures: string[] = [];
    const ecrire = localStorage.setItem.bind(localStorage);
    vi.spyOn(localStorage, "setItem").mockImplementation((k, v) => {
      ecritures.push(v);
      ecrire(k, v);
    });
    expect(await service.definirProtege("", JETON)).toBe("scelle");
    expect(ecritures.join("\n")).not.toContain(JETON);
    expect(service.valeur()).toBe(JETON);
    vi.restoreAllMocks();
  });

  it("garde en clair, et le dit, un jeton dont la protection est annulée sur un projet qui la propose", async () => {
    auth.annuler = true;
    expect(await service.definirProtege("", JETON)).toBe("annule");
    await flushPromises();
    expect(service.forme()).toBe("en-clair");
    expect(service.echecPasskey()).toBe("annule");
    expect(stockage()).toContain(JETON);
  });

  it("efface le scellé avec les jetons", async () => {
    service.definir(JETON);
    await flushPromises();
    await service.proteger();
    service.effacer();
    await flushPromises();
    expect(service.forme()).toBe("en-clair");
    expect(service.verrouille()).toBe(false);
    expect(localStorage.getItem("skanon.jetons-scelles")).toBeNull();
  });
});

describe("le projet qui exige la passkey", () => {
  let auth: FauxAuthentificateur;
  let service: TokenService;

  beforeEach(async () => {
    localStorage.clear();
    auth = new FauxAuthentificateur();
    surLeWeb(auth);
    service = inject(TokenService);
    await service.initialiser();
  });

  it("retire du navigateur le jeton gardé en clair, sans l’ôter à l’onglet", async () => {
    service.definir(JETON);
    await flushPromises();
    service.exigerProtection("exigee");
    await flushPromises();
    expect(stockage()).not.toContain(JETON);
    expect(service.valeur()).toBe(JETON);
    expect(service.forme()).toBe("session");
  });

  it("n’écrit jamais en clair un jeton saisi ensuite", async () => {
    service.exigerProtection("exigee");
    service.definir(AUTRE);
    await flushPromises();
    expect(stockage()).not.toContain(AUTRE);
    expect(service.valeur()).toBe(AUTRE);
  });

  it("ne garde que pour l’onglet un jeton dont la protection est annulée", async () => {
    service.exigerProtection("exigee");
    auth.annuler = true;
    expect(await service.definirProtege("", JETON)).toBe("annule");
    await flushPromises();
    expect(stockage()).not.toContain(JETON);
    expect(service.valeur()).toBe(JETON);
    expect(service.forme()).toBe("session");
  });

  it("garde le jeton protégé une fois la passkey créée", async () => {
    service.definir(JETON);
    service.exigerProtection("exigee");
    expect(await service.proteger()).toBe("scelle");
    expect(service.forme()).toBe("scelle");
    const onglet = await rouvrir(auth);
    expect(onglet.verrouille()).toBe(true);
  });

  it("suit le plus exigeant des projets ouverts dans l’onglet", async () => {
    // un jeton peut en ouvrir plusieurs : on ne garde pas en clair, pour l'un, ce que l'autre a demandé de protéger
    service.exigerProtection("exigee");
    service.exigerProtection("proposee");
    service.definir(JETON);
    await flushPromises();
    expect(stockage()).not.toContain(JETON);
    expect(service.forme()).toBe("session");
  });

  it("n’exige rien de plus sur le bureau, dont le coffre du système suffit", async () => {
    const { resetInjection } = await import("../injection");
    resetInjection();
    const coffre = {
      loadJetons: vi.fn(async () => ({ general: JETON, parPortee: [] })),
      saveJetons: vi.fn(async () => "faite" as const),
      deleteJetons: vi.fn(async () => "faite" as const),
    };
    provide(PLATEFORME, {
      ...createPlateformeWeb(),
      cible: "bureau",
      coffre,
      scellement: null,
    });
    const bureau = inject(TokenService);
    await bureau.initialiser();
    bureau.exigerProtection("exigee");
    await flushPromises();
    expect(coffre.deleteJetons).not.toHaveBeenCalled();
    expect(bureau.forme()).toBe("systeme");
  });
});

describe("les contenus privés suivent le jeton", () => {
  it("chiffre le cache une fois les jetons ouverts, et ne le chiffre plus quand ils sont oubliés", async () => {
    localStorage.clear();
    const auth = new FauxAuthentificateur();
    surLeWeb(auth);
    const cache = inject(ContenusCache);
    const chiffrerAvec = vi.spyOn(cache, "chiffrerAvec");
    const clearPrives = vi.spyOn(cache, "clearPrives");
    const service = inject(TokenService);
    await service.initialiser();
    service.definir(JETON);
    await flushPromises();

    await service.proteger();
    // ce que le cache gardait en clair ne survit pas au scellement
    expect(clearPrives).toHaveBeenCalled();
    expect(chiffrerAvec).toHaveBeenLastCalledWith(expect.anything());

    service.effacer();
    expect(chiffrerAvec).toHaveBeenLastCalledWith(null);
  });

  it("tient le cache fermé tant que les jetons sont verrouillés", async () => {
    localStorage.clear();
    const auth = new FauxAuthentificateur();
    surLeWeb(auth);
    const service = inject(TokenService);
    await service.initialiser();
    service.definir(JETON);
    await flushPromises();
    await service.proteger();

    const { resetInjection } = await import("../injection");
    resetInjection();
    surLeWeb(auth);
    const cache = inject(ContenusCache);
    const verrouiller = vi.spyOn(cache, "verrouiller");
    const chiffrerAvec = vi.spyOn(cache, "chiffrerAvec");
    const onglet = inject(TokenService);
    await onglet.initialiser();
    expect(verrouiller).toHaveBeenCalled();
    await onglet.deverrouiller();
    expect(chiffrerAvec).toHaveBeenLastCalledWith(expect.anything());
  });
});
