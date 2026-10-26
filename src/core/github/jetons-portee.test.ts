import { inject, resetInjection } from "../injection";
import { beforeEach, describe, expect, it } from "vitest";
import { TokenService, repoKeys } from "./token.service";

/**
 * Un rédacteur travaille sur des projets appartenant à plusieurs
 * organisations, et un jeton peut ne couvrir que l'une d'elles. Ces cas portent
 * sur le choix du jeton à présenter, dont dépend tout accès.
 */
describe("jetons par portée", () => {
  let tokens: TokenService;
  let storage: Record<string, string>;
  let session: Record<string, string>;

  /** Un stockage web minimal : le banc d'essai n'en fournit pas. */
  const fake = (data: () => Record<string, string>) => ({
    getItem: (c: string) => data()[c] ?? null,
    setItem: (c: string, v: string) => void (data()[c] = v),
    removeItem: (c: string) => void delete data()[c],
    clear: () => void Object.keys(data()).forEach((c) => delete data()[c]),
  });

  beforeEach(() => {
    storage = {};
    session = {};
    Object.defineProperty(globalThis, "localStorage", {
      configurable: true,
      value: fake(() => storage),
    });
    Object.defineProperty(globalThis, "sessionStorage", {
      configurable: true,
      value: fake(() => session),
    });
    resetInjection();
    tokens = inject(TokenService);
  });

  it("n’a aucun jeton au départ", () => {
    expect(tokens.value()).toBeNull();
    expect(tokens.present()).toBe(false);
  });

  it("présente le jeton de l’organisation du dépôt ouvert", () => {
    tokens.setForScope("ssk-it", "ghp_aaaaaaaaaaaaaaaaaaaa");
    tokens.setForScope("wayne-corp", "ghp_bbbbbbbbbbbbbbbbbbbb");

    tokens.targetRepo({ owner: "ssk-it", repo: "ssk-canon" });
    expect(tokens.value()).toBe("ghp_aaaaaaaaaaaaaaaaaaaa");

    tokens.targetRepo({ owner: "Wayne-Corp", repo: "wayne-chantier-cadrage" });
    expect(tokens.value()).toBe("ghp_bbbbbbbbbbbbbbbbbbbb");
  });

  it("fait primer le jeton d’un dépôt sur celui de son organisation", () => {
    // Le cas visé : lecture sur l'organisation, écriture sur un seul dépôt.
    tokens.setForScope("ssk-it", "ghp_organisation_lecture");
    tokens.setForScope("ssk-it/ssk-canon", "ghp_depot_ecriture");

    tokens.targetRepo({ owner: "ssk-it", repo: "ssk-canon" });
    expect(tokens.value()).toBe("ghp_depot_ecriture");

    tokens.targetRepo({ owner: "ssk-it", repo: "ssk-canon-action" });
    expect(tokens.value()).toBe("ghp_organisation_lecture");
  });

  it("ignore la casse, que la plateforme ne distingue pas", () => {
    tokens.setForScope("SSK-IT", "ghp_aaaaaaaaaaaaaaaaaaaa");
    tokens.targetRepo({ owner: "ssk-it", repo: "ssk-canon" });
    expect(tokens.value()).toBe("ghp_aaaaaaaaaaaaaaaaaaaa");
  });

  it("retombe sur le jeton général quand aucune portée ne correspond", () => {
    tokens.set("ghp_general_aaaaaaaaaaaa");
    tokens.setForScope("ssk-it", "ghp_ssk_aaaaaaaaaaaaaaaa");

    tokens.targetRepo({ owner: "autre-orga", repo: "un-depot" });
    expect(tokens.value()).toBe("ghp_general_aaaaaaaaaaaa");
  });

  it("dit sous quelle portée le jeton courant s’applique", () => {
    tokens.setForScope("ssk-it", "ghp_aaaaaaaaaaaaaaaaaaaa");
    tokens.targetRepo({ owner: "ssk-it", repo: "ssk-canon" });
    expect(tokens.currentScope()).toBe("ssk-it");

    tokens.setForScope("ssk-it/ssk-canon", "ghp_bbbbbbbbbbbbbbbbbbbb");
    expect(tokens.currentScope()).toBe("ssk-it/ssk-canon");

    tokens.targetRepo({ owner: "inconnue", repo: "x" });
    expect(tokens.currentScope()).toBeNull();
  });

  it("oublie une portée sans toucher aux autres", () => {
    tokens.setForScope("ssk-it", "ghp_aaaaaaaaaaaaaaaaaaaa");
    tokens.setForScope("wayne-corp", "ghp_bbbbbbbbbbbbbbbbbbbb");
    tokens.forgetScope("ssk-it");

    tokens.targetRepo({ owner: "ssk-it", repo: "ssk-canon" });
    expect(tokens.value()).toBeNull();
    tokens.targetRepo({ owner: "wayne-corp", repo: "x" });
    expect(tokens.value()).toBe("ghp_bbbbbbbbbbbbbbbbbbbb");
  });

  it("retrouve les jetons d’une session à l’autre", async () => {
    tokens.setForScope("ssk-it", "ghp_aaaaaaaaaaaaaaaaaaaa");
    tokens.set("ghp_general_aaaaaaaaaaaa");

    // session suivante : le stockage local subsiste, celui de session non
    session = {};
    resetInjection();
    const next = inject(TokenService);
    await next.initialize();
    next.targetRepo({ owner: "ssk-it", repo: "ssk-canon" });

    expect(next.value()).toBe("ghp_aaaaaaaaaaaaaaaaaaaa");
    next.targetRepo({ owner: "autre-orga", repo: "x" });
    expect(next.value()).toBe("ghp_general_aaaaaaaaaaaa");
  });

  it("retire une portée du stockage, et pas seulement de la mémoire", async () => {
    tokens.setForScope("ssk-it", "ghp_aaaaaaaaaaaaaaaaaaaa");
    tokens.setForScope("wayne-corp", "ghp_bbbbbbbbbbbbbbbbbbbb");
    tokens.forgetScope("ssk-it");

    resetInjection();
    const next = inject(TokenService);
    await next.initialize();

    next.targetRepo({ owner: "ssk-it", repo: "ssk-canon" });
    expect(next.value()).toBeNull();
    next.targetRepo({ owner: "wayne-corp", repo: "x" });
    expect(next.value()).toBe("ghp_bbbbbbbbbbbbbbbbbbbb");
  });

  it("efface le coffre chiffré qu’une version précédente avait laissé", async () => {
    // Il n'est pas récupérable : la passphrase qui l'ouvrait n'est plus
    // demandée nulle part. Le garder ne ferait qu'occuper la place.
    storage["ssk-canon.coffre"] = JSON.stringify({
      v: 1,
      salt: "x",
      nonce: "y",
      sealed: "z",
    });
    session["ssk-canon.cle-session"] = "une-cle";

    resetInjection();
    const next = inject(TokenService);
    await next.initialize();

    expect(storage["ssk-canon.coffre"]).toBeUndefined();
    expect(session["ssk-canon.cle-session"]).toBeUndefined();
  });

  it("reprend les jetons qu’une version précédente avait écrits en clair", async () => {
    storage["ssk-canon.token"] = "ghp_cccccccccccccccccccc";
    storage["ssk-canon.jetons"] = JSON.stringify([
      ["ssk-it", "ghp_aaaaaaaaaaaaaaaaaaaa"],
    ]);

    resetInjection();
    const next = inject(TokenService);
    await next.initialize();
    next.targetRepo({ owner: "ssk-it", repo: "ssk-canon" });

    expect(next.value()).toBe("ghp_aaaaaaaaaaaaaaaaaaaa");
  });

  it("efface le stockage, et pas seulement la mémoire", async () => {
    tokens.set("ghp_general_aaaaaaaaaaaa");
    tokens.erase();

    resetInjection();
    const next = inject(TokenService);
    await next.initialize();
    expect(next.value()).toBeNull();
    expect(storage["ssk-canon.token"]).toBeUndefined();
    expect(storage["ssk-canon.jetons"]).toBeUndefined();
  });

  it("efface tout, portées comprises", () => {
    tokens.set("ghp_general_aaaaaaaaaaaa");
    tokens.setForScope("ssk-it", "ghp_aaaaaaaaaaaaaaaaaaaa");
    tokens.erase();

    tokens.targetRepo({ owner: "ssk-it", repo: "ssk-canon" });
    expect(tokens.value()).toBeNull();
    expect(tokens.scopes()).toEqual([]);
  });

  it("survit à un stockage corrompu", () => {
    storage["ssk-canon.jetons"] = "pas du JSON";
    resetInjection();
    expect(inject(TokenService).scopes()).toEqual([]);
  });

  it("sépare la clé d’organisation de celle du dépôt", () => {
    expect(repoKeys({ owner: "SSK-IT", repo: "SSK-Canon" })).toEqual({
      organization: "ssk-it",
      exact: "ssk-it/ssk-canon",
    });
  });
});
