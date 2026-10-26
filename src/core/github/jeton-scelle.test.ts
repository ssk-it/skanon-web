import { flushPromises } from "@vue/test-utils";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { inject, provide } from "../injection";
import { PLATFORM } from "../../plateforme/jeton";
import { createWebPlatform } from "../../plateforme/web";
import { BrowserSealedVault } from "../../plateforme/web-scellement";
import { FakeAuthenticator } from "../../plateforme/authentificateur-testing";
import { ContentCache } from "../repo/contenus-cache";
import { TokenService } from "./token.service";

const TOKEN = "github_pat_11AAAAAAA0secretdurouge";
const OTHER = "ghp_autrejetondelorganisationacme";

/** Tout ce que le navigateur garde pour l'origine, d'un bloc. */
function storage(): string {
  return Object.keys(localStorage)
    .map((k) => `${k}=${localStorage.getItem(k)}`)
    .join("\n");
}

/** La version web, dont la passkey est simulée. */
function onTheWeb(auth: FakeAuthenticator): void {
  const vault = new BrowserSealedVault(auth);
  provide(PLATFORM, { ...createWebPlatform(), vault, sealing: vault });
}

/** Un nouvel onglet : un service neuf sur le même stockage. */
async function reopen(auth: FakeAuthenticator): Promise<TokenService> {
  const { resetInjection } = await import("../injection");
  resetInjection();
  onTheWeb(auth);
  const service = inject(TokenService);
  await service.initialize();
  return service;
}

/**
 * Le jeton de la version web derrière une passkey (RG-secret-conserve-localement, RG-protection-du-jeton-par-projet).
 */
describe("le jeton gardé sous passkey", () => {
  let auth: FakeAuthenticator;
  let service: TokenService;

  beforeEach(async () => {
    localStorage.clear();
    auth = new FakeAuthenticator();
    onTheWeb(auth);
    service = inject(TokenService);
    await service.initialize();
  });

  it("dit le jeton gardé en clair tant que rien n’est protégé", () => {
    service.set(TOKEN);
    expect(service.form()).toBe("en-clair");
  });

  it("protège les jetons en place, et n’en laisse que le chiffré", async () => {
    service.set(TOKEN);
    service.setForScope("acme", OTHER);
    await flushPromises();
    expect(await service.protect()).toBe("scelle");
    expect(service.form()).toBe("scelle");
    expect(storage()).not.toContain(TOKEN);
    expect(storage()).not.toContain(OTHER);
  });

  it("se rouvre verrouillé, sans jeton, puis par la passkey", async () => {
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

  it("reste verrouillé quand le déverrouillage est annulé, et le dit", async () => {
    service.set(TOKEN);
    await flushPromises();
    await service.protect();
    const tab = await reopen(auth);
    auth.cancel = true;
    expect(await tab.unlock()).toBe("annule");
    expect(tab.locked()).toBe(true);
    expect(tab.passkeyFailure()).toBe("annule");
  });

  it("s’ouvre dès l’ouverture de l’onglet, sans attendre de clic", async () => {
    service.set(TOKEN);
    await flushPromises();
    await service.protect();
    const tab = await reopen(auth);
    expect(await tab.unlockWithoutGesture()).toBe("ouvert");
    expect(tab.value()).toBe(TOKEN);
  });

  it("ne dit rien d’un refus à l’ouverture de l’onglet : le navigateur a pu exiger un clic", async () => {
    service.set(TOKEN);
    await flushPromises();
    await service.protect();
    const tab = await reopen(auth);
    auth.cancel = true;
    expect(await tab.unlockWithoutGesture()).toBe("annule");
    expect(tab.locked()).toBe(true);
    expect(tab.passkeyFailure()).toBeNull();
  });

  it("garde scellé un jeton saisi une fois ouvert", async () => {
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

  it("protège un jeton à sa saisie sans jamais l’écrire en clair", async () => {
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

  it("garde en clair, et le dit, un jeton dont la protection est annulée sur un projet qui la propose", async () => {
    auth.cancel = true;
    expect(await service.setProtected("", TOKEN)).toBe("annule");
    await flushPromises();
    expect(service.form()).toBe("en-clair");
    expect(service.passkeyFailure()).toBe("annule");
    expect(storage()).toContain(TOKEN);
  });

  it("efface le scellé avec les jetons", async () => {
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

describe("le projet qui exige la passkey", () => {
  let auth: FakeAuthenticator;
  let service: TokenService;

  beforeEach(async () => {
    localStorage.clear();
    auth = new FakeAuthenticator();
    onTheWeb(auth);
    service = inject(TokenService);
    await service.initialize();
  });

  it("retire du navigateur le jeton gardé en clair, sans l’ôter à l’onglet", async () => {
    service.set(TOKEN);
    await flushPromises();
    service.requireProtection("exigee");
    await flushPromises();
    expect(storage()).not.toContain(TOKEN);
    expect(service.value()).toBe(TOKEN);
    expect(service.form()).toBe("session");
  });

  it("n’écrit jamais en clair un jeton saisi ensuite", async () => {
    service.requireProtection("exigee");
    service.set(OTHER);
    await flushPromises();
    expect(storage()).not.toContain(OTHER);
    expect(service.value()).toBe(OTHER);
  });

  it("ne garde que pour l’onglet un jeton dont la protection est annulée", async () => {
    service.requireProtection("exigee");
    auth.cancel = true;
    expect(await service.setProtected("", TOKEN)).toBe("annule");
    await flushPromises();
    expect(storage()).not.toContain(TOKEN);
    expect(service.value()).toBe(TOKEN);
    expect(service.form()).toBe("session");
  });

  it("garde le jeton protégé une fois la passkey créée", async () => {
    service.set(TOKEN);
    service.requireProtection("exigee");
    expect(await service.protect()).toBe("scelle");
    expect(service.form()).toBe("scelle");
    const tab = await reopen(auth);
    expect(tab.locked()).toBe(true);
  });

  it("suit le plus exigeant des projets ouverts dans l’onglet", async () => {
    // un jeton peut en ouvrir plusieurs : on ne garde pas en clair, pour l'un, ce que l'autre a demandé de protéger
    service.requireProtection("exigee");
    service.requireProtection("proposee");
    service.set(TOKEN);
    await flushPromises();
    expect(storage()).not.toContain(TOKEN);
    expect(service.form()).toBe("session");
  });

  it("n’exige rien de plus sur le bureau, dont le coffre du système suffit", async () => {
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

describe("les contenus privés suivent le jeton", () => {
  it("chiffre le cache une fois les jetons ouverts, et ne le chiffre plus quand ils sont oubliés", async () => {
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
    // ce que le cache gardait en clair ne survit pas au scellement
    expect(clearPrivate).toHaveBeenCalled();
    expect(encryptWith).toHaveBeenLastCalledWith(expect.anything());

    service.erase();
    expect(encryptWith).toHaveBeenLastCalledWith(null);
  });

  it("tient le cache fermé tant que les jetons sont verrouillés", async () => {
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
