import { inject, resetInjection } from "../injection";
import { beforeEach, describe, expect, it } from "vitest";
import { TokenService, clesDepot } from "./token.service";

/**
 * Un rédacteur travaille sur des projets appartenant à plusieurs
 * organisations, et un jeton peut ne couvrir que l'une d'elles. Ces cas portent
 * sur le choix du jeton à présenter, dont dépend tout accès.
 */
describe("jetons par portée", () => {
  let tokens: TokenService;
  let stockage: Record<string, string>;
  let session: Record<string, string>;

  /** Un stockage web minimal : le banc d'essai n'en fournit pas. */
  const faux = (donnees: () => Record<string, string>) => ({
    getItem: (c: string) => donnees()[c] ?? null,
    setItem: (c: string, v: string) => void (donnees()[c] = v),
    removeItem: (c: string) => void delete donnees()[c],
    clear: () =>
      void Object.keys(donnees()).forEach((c) => delete donnees()[c]),
  });

  beforeEach(() => {
    stockage = {};
    session = {};
    Object.defineProperty(globalThis, "localStorage", {
      configurable: true,
      value: faux(() => stockage),
    });
    Object.defineProperty(globalThis, "sessionStorage", {
      configurable: true,
      value: faux(() => session),
    });
    resetInjection();
    tokens = inject(TokenService);
  });

  it("n’a aucun jeton au départ", () => {
    expect(tokens.valeur()).toBeNull();
    expect(tokens.present()).toBe(false);
  });

  it("présente le jeton de l’organisation du dépôt ouvert", () => {
    tokens.definirPourPortee("ssk-it", "ghp_aaaaaaaaaaaaaaaaaaaa");
    tokens.definirPourPortee("wayne-corp", "ghp_bbbbbbbbbbbbbbbbbbbb");

    tokens.cibler({ owner: "ssk-it", repo: "ssk-canon" });
    expect(tokens.valeur()).toBe("ghp_aaaaaaaaaaaaaaaaaaaa");

    tokens.cibler({ owner: "Wayne-Corp", repo: "wayne-chantier-cadrage" });
    expect(tokens.valeur()).toBe("ghp_bbbbbbbbbbbbbbbbbbbb");
  });

  it("fait primer le jeton d’un dépôt sur celui de son organisation", () => {
    // Le cas visé : lecture sur l'organisation, écriture sur un seul dépôt.
    tokens.definirPourPortee("ssk-it", "ghp_organisation_lecture");
    tokens.definirPourPortee("ssk-it/ssk-canon", "ghp_depot_ecriture");

    tokens.cibler({ owner: "ssk-it", repo: "ssk-canon" });
    expect(tokens.valeur()).toBe("ghp_depot_ecriture");

    tokens.cibler({ owner: "ssk-it", repo: "ssk-canon-action" });
    expect(tokens.valeur()).toBe("ghp_organisation_lecture");
  });

  it("ignore la casse, que la plateforme ne distingue pas", () => {
    tokens.definirPourPortee("SSK-IT", "ghp_aaaaaaaaaaaaaaaaaaaa");
    tokens.cibler({ owner: "ssk-it", repo: "ssk-canon" });
    expect(tokens.valeur()).toBe("ghp_aaaaaaaaaaaaaaaaaaaa");
  });

  it("retombe sur le jeton général quand aucune portée ne correspond", () => {
    tokens.definir("ghp_general_aaaaaaaaaaaa");
    tokens.definirPourPortee("ssk-it", "ghp_ssk_aaaaaaaaaaaaaaaa");

    tokens.cibler({ owner: "autre-orga", repo: "un-depot" });
    expect(tokens.valeur()).toBe("ghp_general_aaaaaaaaaaaa");
  });

  it("dit sous quelle portée le jeton courant s’applique", () => {
    tokens.definirPourPortee("ssk-it", "ghp_aaaaaaaaaaaaaaaaaaaa");
    tokens.cibler({ owner: "ssk-it", repo: "ssk-canon" });
    expect(tokens.porteeCourante()).toBe("ssk-it");

    tokens.definirPourPortee("ssk-it/ssk-canon", "ghp_bbbbbbbbbbbbbbbbbbbb");
    expect(tokens.porteeCourante()).toBe("ssk-it/ssk-canon");

    tokens.cibler({ owner: "inconnue", repo: "x" });
    expect(tokens.porteeCourante()).toBeNull();
  });

  it("oublie une portée sans toucher aux autres", () => {
    tokens.definirPourPortee("ssk-it", "ghp_aaaaaaaaaaaaaaaaaaaa");
    tokens.definirPourPortee("wayne-corp", "ghp_bbbbbbbbbbbbbbbbbbbb");
    tokens.oublierPortee("ssk-it");

    tokens.cibler({ owner: "ssk-it", repo: "ssk-canon" });
    expect(tokens.valeur()).toBeNull();
    tokens.cibler({ owner: "wayne-corp", repo: "x" });
    expect(tokens.valeur()).toBe("ghp_bbbbbbbbbbbbbbbbbbbb");
  });

  it("retrouve les jetons d’une session à l’autre", async () => {
    tokens.definirPourPortee("ssk-it", "ghp_aaaaaaaaaaaaaaaaaaaa");
    tokens.definir("ghp_general_aaaaaaaaaaaa");

    // session suivante : le stockage local subsiste, celui de session non
    session = {};
    resetInjection();
    const suivant = inject(TokenService);
    await suivant.initialiser();
    suivant.cibler({ owner: "ssk-it", repo: "ssk-canon" });

    expect(suivant.valeur()).toBe("ghp_aaaaaaaaaaaaaaaaaaaa");
    suivant.cibler({ owner: "autre-orga", repo: "x" });
    expect(suivant.valeur()).toBe("ghp_general_aaaaaaaaaaaa");
  });

  it("retire une portée du stockage, et pas seulement de la mémoire", async () => {
    tokens.definirPourPortee("ssk-it", "ghp_aaaaaaaaaaaaaaaaaaaa");
    tokens.definirPourPortee("wayne-corp", "ghp_bbbbbbbbbbbbbbbbbbbb");
    tokens.oublierPortee("ssk-it");

    resetInjection();
    const suivant = inject(TokenService);
    await suivant.initialiser();

    suivant.cibler({ owner: "ssk-it", repo: "ssk-canon" });
    expect(suivant.valeur()).toBeNull();
    suivant.cibler({ owner: "wayne-corp", repo: "x" });
    expect(suivant.valeur()).toBe("ghp_bbbbbbbbbbbbbbbbbbbb");
  });

  it("efface le coffre chiffré qu’une version précédente avait laissé", async () => {
    // Il n'est pas récupérable : la passphrase qui l'ouvrait n'est plus
    // demandée nulle part. Le garder ne ferait qu'occuper la place.
    stockage["ssk-canon.coffre"] = JSON.stringify({
      v: 1,
      sel: "x",
      nonce: "y",
      scelle: "z",
    });
    session["ssk-canon.cle-session"] = "une-cle";

    resetInjection();
    const suivant = inject(TokenService);
    await suivant.initialiser();

    expect(stockage["ssk-canon.coffre"]).toBeUndefined();
    expect(session["ssk-canon.cle-session"]).toBeUndefined();
  });

  it("reprend les jetons qu’une version précédente avait écrits en clair", async () => {
    stockage["ssk-canon.token"] = "ghp_cccccccccccccccccccc";
    stockage["ssk-canon.jetons"] = JSON.stringify([
      ["ssk-it", "ghp_aaaaaaaaaaaaaaaaaaaa"],
    ]);

    resetInjection();
    const suivant = inject(TokenService);
    await suivant.initialiser();
    suivant.cibler({ owner: "ssk-it", repo: "ssk-canon" });

    expect(suivant.valeur()).toBe("ghp_aaaaaaaaaaaaaaaaaaaa");
  });

  it("efface le stockage, et pas seulement la mémoire", async () => {
    tokens.definir("ghp_general_aaaaaaaaaaaa");
    tokens.effacer();

    resetInjection();
    const suivant = inject(TokenService);
    await suivant.initialiser();
    expect(suivant.valeur()).toBeNull();
    expect(stockage["ssk-canon.token"]).toBeUndefined();
    expect(stockage["ssk-canon.jetons"]).toBeUndefined();
  });

  it("efface tout, portées comprises", () => {
    tokens.definir("ghp_general_aaaaaaaaaaaa");
    tokens.definirPourPortee("ssk-it", "ghp_aaaaaaaaaaaaaaaaaaaa");
    tokens.effacer();

    tokens.cibler({ owner: "ssk-it", repo: "ssk-canon" });
    expect(tokens.valeur()).toBeNull();
    expect(tokens.portees()).toEqual([]);
  });

  it("survit à un stockage corrompu", () => {
    stockage["ssk-canon.jetons"] = "pas du JSON";
    resetInjection();
    expect(inject(TokenService).portees()).toEqual([]);
  });

  it("sépare la clé d’organisation de celle du dépôt", () => {
    expect(clesDepot({ owner: "SSK-IT", repo: "SSK-Canon" })).toEqual({
      organisation: "ssk-it",
      exacte: "ssk-it/ssk-canon",
    });
  });
});
