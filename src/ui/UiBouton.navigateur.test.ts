import { mount } from "@vue/test-utils";
import { afterEach, describe, expect, it } from "vitest";
import { h } from "vue";
import "../styles.css";
import UiButton from "./UiBouton.vue";
import UiIcon from "./UiIcone.vue";

/**
 * Le calque d'état d'un bouton d'icône est un disque centré sur le bouton : l'icône doit l'être aussi, à sa taille de `mat-icon`. Décalée, elle sort du disque au survol — un défaut que seule la mise en page révèle, et que jsdom ne calcule pas.
 */
describe("bouton d'icône", () => {
  const mounted: { unmount(): void }[] = [];
  afterEach(() => mounted.splice(0).forEach((m) => m.unmount()));

  function boxes(): { button: DOMRect; icon: DOMRect } {
    const wrapper = mount(UiButton, {
      props: { variant: "icon" },
      slots: { default: () => h(UiIcon, { name: "lock" }) },
      attachTo: document.body,
    });
    mounted.push(wrapper);
    return {
      button: wrapper.element.getBoundingClientRect(),
      icon: wrapper
        .find(".material-symbols-outlined")
        .element.getBoundingClientRect(),
    };
  }

  it("garde l'icône à 24 px", () => {
    const { icon } = boxes();
    expect(icon.width).toBe(24);
    expect(icon.height).toBe(24);
  });

  it("centre l'icône sur le calque d'état", () => {
    const { button, icon } = boxes();
    expect(icon.left + icon.width / 2).toBeCloseTo(
      button.left + button.width / 2,
      0,
    );
    expect(icon.top + icon.height / 2).toBeCloseTo(
      button.top + button.height / 2,
      0,
    );
  });
});
