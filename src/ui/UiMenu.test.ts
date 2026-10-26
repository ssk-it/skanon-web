import { flushPromises, mount, type VueWrapper } from "@vue/test-utils";
import { afterEach, describe, expect, it, vi } from "vitest";
import { defineComponent, h } from "vue";
import UiMenu, { type MenuAction } from "./UiMenu.vue";

let mounted: VueWrapper | null = null;

function mountView(actions: readonly MenuAction[]) {
  const Host = defineComponent({
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
  mounted = mount(Host, { attachTo: document.body });
  return {
    trigger: () => document.querySelector<HTMLButtonElement>(".declencheur")!,
    panel: () => document.querySelector<HTMLElement>(".ui-menu__panneau"),
    entries: () =>
      Array.from(
        document.querySelectorAll<HTMLButtonElement>(".ui-menu__entree"),
      ),
  };
}

function pressKey(target: Element, key: string): void {
  target.dispatchEvent(
    new KeyboardEvent("keydown", { key, bubbles: true, cancelable: true }),
  );
}

afterEach(() => {
  mounted?.unmount();
  mounted = null;
  document.body.innerHTML = "";
});

describe("UiMenu", () => {
  const edit = vi.fn();
  const deleteItem = vi.fn();
  const ACTIONS: MenuAction[] = [
    { label: "Modifier", icon: "edit", action: edit },
    { label: "Supprimer", icon: "link_off", action: deleteItem },
  ];

  afterEach(() => {
    edit.mockReset();
    deleteItem.mockReset();
  });

  it("reste fermé tant qu’on ne clique pas sur le déclencheur", () => {
    const m = mountView(ACTIONS);
    expect(m.panel()).toBeNull();
    expect(m.trigger().getAttribute("aria-expanded")).toBe("false");
    expect(m.trigger().getAttribute("aria-haspopup")).toBe("menu");
  });

  it("ouvre la liste des actions au clic, et y pose le focus", async () => {
    const m = mountView(ACTIONS);
    m.trigger().click();
    await flushPromises();

    expect(m.panel()?.getAttribute("role")).toBe("menu");
    expect(m.entries().map((e) => e.textContent?.trim())).toEqual([
      "editModifier",
      "link_offSupprimer",
    ]);
    expect(m.trigger().getAttribute("aria-expanded")).toBe("true");
    expect(document.activeElement).toBe(m.entries()[0]);
  });

  it("referme puis exécute l’action choisie", async () => {
    const m = mountView(ACTIONS);
    m.trigger().click();
    await flushPromises();

    m.entries()[1]!.click();
    await flushPromises();

    expect(deleteItem).toHaveBeenCalledOnce();
    expect(edit).not.toHaveBeenCalled();
    expect(m.panel()).toBeNull();
  });

  it("se ferme au clic dehors, sans rien exécuter", async () => {
    const m = mountView(ACTIONS);
    m.trigger().click();
    await flushPromises();

    document
      .querySelector(".ailleurs")!
      .dispatchEvent(new Event("pointerdown", { bubbles: true }));
    await flushPromises();

    expect(m.panel()).toBeNull();
    expect(edit).not.toHaveBeenCalled();
    expect(deleteItem).not.toHaveBeenCalled();
  });

  it("ne se ferme pas à un appui dans le panneau", async () => {
    const m = mountView(ACTIONS);
    m.trigger().click();
    await flushPromises();

    m.entries()[0]!.dispatchEvent(new Event("pointerdown", { bubbles: true }));
    await flushPromises();

    expect(m.panel()).not.toBeNull();
  });

  it("se ferme à Échap, et rend le focus au déclencheur", async () => {
    const m = mountView(ACTIONS);
    m.trigger().click();
    await flushPromises();

    pressKey(m.entries()[0]!, "Escape");
    await flushPromises();

    expect(m.panel()).toBeNull();
    expect(document.activeElement).toBe(m.trigger());
  });

  it("se referme au second clic sur le déclencheur", async () => {
    const m = mountView(ACTIONS);
    m.trigger().click();
    await flushPromises();
    m.trigger().click();
    await flushPromises();

    expect(m.panel()).toBeNull();
  });

  it("parcourt les entrées aux flèches, en boucle", async () => {
    const m = mountView(ACTIONS);
    m.trigger().click();
    await flushPromises();

    pressKey(m.entries()[0]!, "ArrowDown");
    expect(document.activeElement).toBe(m.entries()[1]);
    pressKey(m.entries()[1]!, "ArrowDown");
    expect(document.activeElement).toBe(m.entries()[0]);
    pressKey(m.entries()[0]!, "ArrowUp");
    expect(document.activeElement).toBe(m.entries()[1]);
  });

  it("ne propose pas une action désactivée", async () => {
    const m = mountView([
      { label: "Modifier", action: edit },
      { label: "Supprimer", action: deleteItem, disabled: true },
    ]);
    m.trigger().click();
    await flushPromises();

    expect(m.entries()[1]!.disabled).toBe(true);
  });
});
