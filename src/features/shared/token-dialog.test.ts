import { flushPromises, mount } from "@vue/test-utils";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { TokenService } from "../../core/github/token.service";
import { inject, resetInjection } from "../../core/injection";
import TokenDialog from "./TokenDialog.vue";

/**
 * Sign-in to GitHub, in personal token mode: the creation help is read at the moment of input — RG-secret-conserve-localement.
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

  it("expands how to create a token as long as no access is in place", async () => {
    const view = mount(TokenDialog);
    await flushPromises();
    expect(guide(view).attributes("open")).toBeDefined();
  });

  it("keeps it collapsed for those who already have a token, of whatever scope", async () => {
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
 * The token protected by a passkey as soon as it is entered, in the web version — RG-secret-conserve-localement, RG-protection-du-jeton-par-projet. The service's states are simulated: what matters here is the dialog's texts and gestures.
 */
describe("TokenDialog and the passkey", () => {
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

  it("offers to protect the token with a passkey, and protects it on save", async () => {
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

  it("keeps the token in clear when protection is unchecked", async () => {
    const setProtected = vi.spyOn(tokens, "setProtected");
    const setForScope = vi.spyOn(tokens, "setForScope");
    const view = await mountView();
    await protectCheckbox(view).setValue(false);
    await enterAndSave(view);
    expect(setProtected).not.toHaveBeenCalled();
    expect(setForScope).toHaveBeenCalled();
  });

  it("leaves no choice on a project that requires the passkey", async () => {
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

  it("says a browser that cannot protect the token will keep it in clear", async () => {
    vi.spyOn(tokens, "canProtect").mockResolvedValue(false);
    const view = await mountView();
    expect(protectCheckbox(view).exists()).toBe(false);
    expect(view.find(".protection").text()).toContain("en clair");
  });

  it("says such a browser will keep a requiring project's token only for the tab", async () => {
    vi.spyOn(tokens, "canProtect").mockResolvedValue(false);
    vi.spyOn(tokens, "protectionRequired").mockReturnValue(true);
    const view = await mountView();
    expect(view.find(".protection").text()).toContain("pour cet onglet");
  });

  it("first asks to unlock sealed tokens", async () => {
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

  it("seals an entered token by default when tokens are already protected", async () => {
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

  it("does not mention a passkey on the desktop, where the system keychain suffices", async () => {
    vi.spyOn(tokens, "form").mockReturnValue("systeme");
    vi.spyOn(tokens, "canProtect").mockResolvedValue(false);
    const view = await mountView();
    expect(view.find(".protection").exists()).toBe(false);
  });

  it("lists Issues read among the permissions, for reading as for authoring", async () => {
    // Without it, the roadmap does not display: discovering the permission afterwards
    // would force recreating the token (scoping 2026-058, RG-pistes-a-part).
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
