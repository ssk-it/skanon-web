import { flushPromises, mount } from "@vue/test-utils";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { TokenService } from "../../core/github/token.service";
import { inject, resetInjection } from "../../core/injection";
import TokenDialog from "./TokenDialog.vue";

/**
 * La connexion à GitHub, en mode jeton personnel : l'aide à la création se lit au moment de la saisie — RG-secret-conserve-localement.
 */
describe("TokenDialog", () => {
  beforeEach(() => {
    resetInjection();
    Object.defineProperty(globalThis, "localStorage", {
      configurable: true,
      value: {
        getItem: () => null,
        setItem: () => {},
        removeItem: () => {},
        clear: () => {},
      },
    });
  });

  const guide = (vue: ReturnType<typeof mount>) =>
    vue
      .findAll("details.guide")
      .find((d) => d.find("summary").text() === "Comment créer un jeton ?")!;

  it("déplie la façon de créer un jeton tant qu’aucun accès n’est en place", async () => {
    const vue = mount(TokenDialog);
    await flushPromises();
    expect(guide(vue).attributes("open")).toBeDefined();
  });

  it("la garde repliée pour qui a déjà un jeton, de quelque portée", async () => {
    inject(TokenService).definirPourPortee(
      "wayne-corp",
      "ghp_abcdefghijklmnopqrst1234",
    );
    const vue = mount(TokenDialog);
    await flushPromises();
    expect(guide(vue).attributes("open")).toBeUndefined();
  });
});

/**
 * Le jeton protégé par une passkey dès sa saisie, dans la version web — RG-secret-conserve-localement, RG-protection-du-jeton-par-projet. Les états du service sont simulés : ce sont les textes et les gestes du dialogue qui comptent ici.
 */
describe("TokenDialog et la passkey", () => {
  const JETON = "ghp_abcdefghijklmnopqrst1234";
  let tokens: TokenService;

  beforeEach(() => {
    resetInjection();
    tokens = inject(TokenService);
    vi.spyOn(tokens, "peutProteger").mockResolvedValue(true);
  });

  async function monter() {
    const vue = mount(TokenDialog);
    await flushPromises();
    return vue;
  }

  async function saisirEtEnregistrer(vue: ReturnType<typeof mount>) {
    await vue.find("input[type=password]").setValue(JETON);
    await vue
      .findAll("button")
      .find((b) => b.text() === "Enregistrer")!
      .trigger("click");
    await flushPromises();
  }

  const caseProteger = (vue: ReturnType<typeof mount>) =>
    vue.find(".protection input[type=checkbox]");

  it("propose de protéger le jeton par une passkey, et le protège à l’enregistrement", async () => {
    const definirProtege = vi
      .spyOn(tokens, "definirProtege")
      .mockResolvedValue("scelle");
    const vue = await monter();
    expect(caseProteger(vue).exists()).toBe(true);
    expect((caseProteger(vue).element as HTMLInputElement).checked).toBe(true);
    await saisirEtEnregistrer(vue);
    expect(definirProtege).toHaveBeenCalledWith(expect.any(String), JETON);
  });

  it("garde le jeton en clair quand la protection est décochée", async () => {
    const definirProtege = vi.spyOn(tokens, "definirProtege");
    const definirPourPortee = vi.spyOn(tokens, "definirPourPortee");
    const vue = await monter();
    await caseProteger(vue).setValue(false);
    await saisirEtEnregistrer(vue);
    expect(definirProtege).not.toHaveBeenCalled();
    expect(definirPourPortee).toHaveBeenCalled();
  });

  it("ne laisse pas le choix sur un projet qui exige la passkey", async () => {
    vi.spyOn(tokens, "protectionExigee").mockReturnValue(true);
    const definirProtege = vi
      .spyOn(tokens, "definirProtege")
      .mockResolvedValue("scelle");
    const vue = await monter();
    expect(caseProteger(vue).exists()).toBe(false);
    expect(vue.find(".protection").text()).toContain("exige");
    await saisirEtEnregistrer(vue);
    expect(definirProtege).toHaveBeenCalled();
  });

  it("dit qu’un navigateur qui ne sait pas protéger le jeton le gardera en clair", async () => {
    vi.spyOn(tokens, "peutProteger").mockResolvedValue(false);
    const vue = await monter();
    expect(caseProteger(vue).exists()).toBe(false);
    expect(vue.find(".protection").text()).toContain("en clair");
  });

  it("dit qu’un tel navigateur ne gardera que pour l’onglet le jeton d’un projet qui l’exige", async () => {
    vi.spyOn(tokens, "peutProteger").mockResolvedValue(false);
    vi.spyOn(tokens, "protectionExigee").mockReturnValue(true);
    const vue = await monter();
    expect(vue.find(".protection").text()).toContain("pour cet onglet");
  });

  it("demande d’abord de déverrouiller des jetons scellés", async () => {
    vi.spyOn(tokens, "verrouille").mockReturnValue(true);
    vi.spyOn(tokens, "forme").mockReturnValue("scelle");
    const deverrouiller = vi
      .spyOn(tokens, "deverrouiller")
      .mockResolvedValue("ouvert");
    const vue = await monter();
    expect(vue.find("input[type=password]").exists()).toBe(false);
    await vue
      .findAll("button")
      .find((b) => b.text() === "Déverrouiller")!
      .trigger("click");
    await flushPromises();
    expect(deverrouiller).toHaveBeenCalled();
    expect(vue.emitted("fermer")).toEqual([[true]]);
  });

  it("scelle d’office un jeton saisi quand les jetons sont déjà protégés", async () => {
    vi.spyOn(tokens, "forme").mockReturnValue("scelle");
    const definirPourPortee = vi.spyOn(tokens, "definirPourPortee");
    const vue = await monter();
    expect(caseProteger(vue).exists()).toBe(false);
    expect(vue.find(".protection").text()).toContain(
      "protégés par une passkey",
    );
    await saisirEtEnregistrer(vue);
    expect(definirPourPortee).toHaveBeenCalled();
  });

  it("ne parle pas de passkey sur le bureau, dont le coffre du système suffit", async () => {
    vi.spyOn(tokens, "forme").mockReturnValue("systeme");
    vi.spyOn(tokens, "peutProteger").mockResolvedValue(false);
    const vue = await monter();
    expect(vue.find(".protection").exists()).toBe(false);
  });

  it("range Issues en lecture parmi les droits, pour consulter comme pour rédiger", async () => {
    // Sans lui, la roadmap ne s'affiche pas : découvrir le droit après coup
    // obligerait à recréer le jeton (cadrage 2026-058, RG-pistes-a-part).
    const vue = mount(TokenDialog);
    await flushPromises();
    const ligne = vue
      .findAll("table.permissions tbody tr")
      .find((tr) => tr.find("td").text() === "Issues");
    expect(ligne).toBeDefined();
    expect(ligne!.findAll("td").map((td) => td.text())).toEqual([
      "Issues",
      "Read-only",
      "Read-only",
    ]);
    expect(vue.text()).toContain("roadmap");
  });
});
