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

  const guide = (view: ReturnType<typeof mount>) =>
    view
      .findAll("details.guide")
      .find((d) => d.find("summary").text() === "Comment créer un jeton ?")!;

  it("déplie la façon de créer un jeton tant qu’aucun accès n’est en place", async () => {
    const view = mount(TokenDialog);
    await flushPromises();
    expect(guide(view).attributes("open")).toBeDefined();
  });

  it("la garde repliée pour qui a déjà un jeton, de quelque portée", async () => {
    inject(TokenService).setForScope(
      "wayne-corp",
      "ghp_abcdefghijklmnopqrst1234",
    );
    const view = mount(TokenDialog);
    await flushPromises();
    expect(guide(view).attributes("open")).toBeUndefined();
  });
});

/**
 * Le jeton protégé par une passkey dès sa saisie, dans la version web — RG-secret-conserve-localement, RG-protection-du-jeton-par-projet. Les états du service sont simulés : ce sont les textes et les gestes du dialogue qui comptent ici.
 */
describe("TokenDialog et la passkey", () => {
  const TOKEN = "ghp_abcdefghijklmnopqrst1234";
  let tokens: TokenService;

  beforeEach(() => {
    resetInjection();
    tokens = inject(TokenService);
    vi.spyOn(tokens, "canProtect").mockResolvedValue(true);
  });

  async function mountView() {
    const view = mount(TokenDialog);
    await flushPromises();
    return view;
  }

  async function enterAndSave(view: ReturnType<typeof mount>) {
    await view.find("input[type=password]").setValue(TOKEN);
    await view
      .findAll("button")
      .find((b) => b.text() === "Enregistrer")!
      .trigger("click");
    await flushPromises();
  }

  const protectCheckbox = (view: ReturnType<typeof mount>) =>
    view.find(".protection input[type=checkbox]");

  it("propose de protéger le jeton par une passkey, et le protège à l’enregistrement", async () => {
    const setProtected = vi
      .spyOn(tokens, "setProtected")
      .mockResolvedValue("scelle");
    const view = await mountView();
    expect(protectCheckbox(view).exists()).toBe(true);
    expect((protectCheckbox(view).element as HTMLInputElement).checked).toBe(
      true,
    );
    await enterAndSave(view);
    expect(setProtected).toHaveBeenCalledWith(expect.any(String), TOKEN);
  });

  it("garde le jeton en clair quand la protection est décochée", async () => {
    const setProtected = vi.spyOn(tokens, "setProtected");
    const setForScope = vi.spyOn(tokens, "setForScope");
    const view = await mountView();
    await protectCheckbox(view).setValue(false);
    await enterAndSave(view);
    expect(setProtected).not.toHaveBeenCalled();
    expect(setForScope).toHaveBeenCalled();
  });

  it("ne laisse pas le choix sur un projet qui exige la passkey", async () => {
    vi.spyOn(tokens, "protectionRequired").mockReturnValue(true);
    const setProtected = vi
      .spyOn(tokens, "setProtected")
      .mockResolvedValue("scelle");
    const view = await mountView();
    expect(protectCheckbox(view).exists()).toBe(false);
    expect(view.find(".protection").text()).toContain("exige");
    await enterAndSave(view);
    expect(setProtected).toHaveBeenCalled();
  });

  it("dit qu’un navigateur qui ne sait pas protéger le jeton le gardera en clair", async () => {
    vi.spyOn(tokens, "canProtect").mockResolvedValue(false);
    const view = await mountView();
    expect(protectCheckbox(view).exists()).toBe(false);
    expect(view.find(".protection").text()).toContain("en clair");
  });

  it("dit qu’un tel navigateur ne gardera que pour l’onglet le jeton d’un projet qui l’exige", async () => {
    vi.spyOn(tokens, "canProtect").mockResolvedValue(false);
    vi.spyOn(tokens, "protectionRequired").mockReturnValue(true);
    const view = await mountView();
    expect(view.find(".protection").text()).toContain("pour cet onglet");
  });

  it("demande d’abord de déverrouiller des jetons scellés", async () => {
    vi.spyOn(tokens, "locked").mockReturnValue(true);
    vi.spyOn(tokens, "form").mockReturnValue("scelle");
    const unlock = vi.spyOn(tokens, "unlock").mockResolvedValue("ouvert");
    const view = await mountView();
    expect(view.find("input[type=password]").exists()).toBe(false);
    await view
      .findAll("button")
      .find((b) => b.text() === "Déverrouiller")!
      .trigger("click");
    await flushPromises();
    expect(unlock).toHaveBeenCalled();
    expect(view.emitted("close")).toEqual([[true]]);
  });

  it("scelle d’office un jeton saisi quand les jetons sont déjà protégés", async () => {
    vi.spyOn(tokens, "form").mockReturnValue("scelle");
    const setForScope = vi.spyOn(tokens, "setForScope");
    const view = await mountView();
    expect(protectCheckbox(view).exists()).toBe(false);
    expect(view.find(".protection").text()).toContain(
      "protégés par une passkey",
    );
    await enterAndSave(view);
    expect(setForScope).toHaveBeenCalled();
  });

  it("ne parle pas de passkey sur le bureau, dont le coffre du système suffit", async () => {
    vi.spyOn(tokens, "form").mockReturnValue("systeme");
    vi.spyOn(tokens, "canProtect").mockResolvedValue(false);
    const view = await mountView();
    expect(view.find(".protection").exists()).toBe(false);
  });

  it("range Issues en lecture parmi les droits, pour consulter comme pour rédiger", async () => {
    // Sans lui, la roadmap ne s'affiche pas : découvrir le droit après coup
    // obligerait à recréer le jeton (cadrage 2026-058, RG-pistes-a-part).
    const view = mount(TokenDialog);
    await flushPromises();
    const line = view
      .findAll("table.permissions tbody tr")
      .find((tr) => tr.find("td").text() === "Issues");
    expect(line).toBeDefined();
    expect(line!.findAll("td").map((td) => td.text())).toEqual([
      "Issues",
      "Read-only",
      "Read-only",
    ]);
    expect(view.text()).toContain("roadmap");
  });
});
