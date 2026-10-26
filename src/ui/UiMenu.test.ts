import { flushPromises, mount, type VueWrapper } from "@vue/test-utils";
import { afterEach, describe, expect, it, vi } from "vitest";
import { defineComponent, h } from "vue";
import UiMenu, { type ActionMenu } from "./UiMenu.vue";

let monte: VueWrapper | null = null;

function monter(actions: readonly ActionMenu[]) {
  const Hote = defineComponent({
    setup() {
      return () =>
        h("div", [
          h(
            UiMenu,
            { actions },
            {
              declencheur: ({
                attributs,
              }: {
                attributs: Record<string, unknown>;
              }) =>
                h("button", { class: "declencheur", ...attributs }, "Actions"),
            },
          ),
          h("p", { class: "ailleurs" }, "Ailleurs"),
        ]);
    },
  });
  monte = mount(Hote, { attachTo: document.body });
  return {
    declencheur: () =>
      document.querySelector<HTMLButtonElement>(".declencheur")!,
    panneau: () => document.querySelector<HTMLElement>(".ui-menu__panneau"),
    entrees: () =>
      Array.from(
        document.querySelectorAll<HTMLButtonElement>(".ui-menu__entree"),
      ),
  };
}

function touche(cible: Element, key: string): void {
  cible.dispatchEvent(
    new KeyboardEvent("keydown", { key, bubbles: true, cancelable: true }),
  );
}

afterEach(() => {
  monte?.unmount();
  monte = null;
  document.body.innerHTML = "";
});

describe("UiMenu", () => {
  const modifier = vi.fn();
  const supprimer = vi.fn();
  const ACTIONS: ActionMenu[] = [
    { libelle: "Modifier", icone: "edit", action: modifier },
    { libelle: "Supprimer", icone: "link_off", action: supprimer },
  ];

  afterEach(() => {
    modifier.mockReset();
    supprimer.mockReset();
  });

  it("reste fermé tant qu’on ne clique pas sur le déclencheur", () => {
    const m = monter(ACTIONS);
    expect(m.panneau()).toBeNull();
    expect(m.declencheur().getAttribute("aria-expanded")).toBe("false");
    expect(m.declencheur().getAttribute("aria-haspopup")).toBe("menu");
  });

  it("ouvre la liste des actions au clic, et y pose le focus", async () => {
    const m = monter(ACTIONS);
    m.declencheur().click();
    await flushPromises();

    expect(m.panneau()?.getAttribute("role")).toBe("menu");
    expect(m.entrees().map((e) => e.textContent?.trim())).toEqual([
      "editModifier",
      "link_offSupprimer",
    ]);
    expect(m.declencheur().getAttribute("aria-expanded")).toBe("true");
    expect(document.activeElement).toBe(m.entrees()[0]);
  });

  it("referme puis exécute l’action choisie", async () => {
    const m = monter(ACTIONS);
    m.declencheur().click();
    await flushPromises();

    m.entrees()[1]!.click();
    await flushPromises();

    expect(supprimer).toHaveBeenCalledOnce();
    expect(modifier).not.toHaveBeenCalled();
    expect(m.panneau()).toBeNull();
  });

  it("se ferme au clic dehors, sans rien exécuter", async () => {
    const m = monter(ACTIONS);
    m.declencheur().click();
    await flushPromises();

    document
      .querySelector(".ailleurs")!
      .dispatchEvent(new Event("pointerdown", { bubbles: true }));
    await flushPromises();

    expect(m.panneau()).toBeNull();
    expect(modifier).not.toHaveBeenCalled();
    expect(supprimer).not.toHaveBeenCalled();
  });

  it("ne se ferme pas à un appui dans le panneau", async () => {
    const m = monter(ACTIONS);
    m.declencheur().click();
    await flushPromises();

    m.entrees()[0]!.dispatchEvent(new Event("pointerdown", { bubbles: true }));
    await flushPromises();

    expect(m.panneau()).not.toBeNull();
  });

  it("se ferme à Échap, et rend le focus au déclencheur", async () => {
    const m = monter(ACTIONS);
    m.declencheur().click();
    await flushPromises();

    touche(m.entrees()[0]!, "Escape");
    await flushPromises();

    expect(m.panneau()).toBeNull();
    expect(document.activeElement).toBe(m.declencheur());
  });

  it("se referme au second clic sur le déclencheur", async () => {
    const m = monter(ACTIONS);
    m.declencheur().click();
    await flushPromises();
    m.declencheur().click();
    await flushPromises();

    expect(m.panneau()).toBeNull();
  });

  it("parcourt les entrées aux flèches, en boucle", async () => {
    const m = monter(ACTIONS);
    m.declencheur().click();
    await flushPromises();

    touche(m.entrees()[0]!, "ArrowDown");
    expect(document.activeElement).toBe(m.entrees()[1]);
    touche(m.entrees()[1]!, "ArrowDown");
    expect(document.activeElement).toBe(m.entrees()[0]);
    touche(m.entrees()[0]!, "ArrowUp");
    expect(document.activeElement).toBe(m.entrees()[1]);
  });

  it("ne propose pas une action désactivée", async () => {
    const m = monter([
      { libelle: "Modifier", action: modifier },
      { libelle: "Supprimer", action: supprimer, desactive: true },
    ]);
    m.declencheur().click();
    await flushPromises();

    expect(m.entrees()[1]!.disabled).toBe(true);
  });
});
