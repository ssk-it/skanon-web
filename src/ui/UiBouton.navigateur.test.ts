import { mount } from "@vue/test-utils";
import { afterEach, describe, expect, it } from "vitest";
import { h } from "vue";
import "../styles.css";
import UiBouton from "./UiBouton.vue";
import UiIcone from "./UiIcone.vue";

/**
 * Le calque d'état d'un bouton d'icône est un disque centré sur le bouton : l'icône doit l'être aussi, à sa taille de `mat-icon`. Décalée, elle sort du disque au survol — un défaut que seule la mise en page révèle, et que jsdom ne calcule pas.
 */
describe("bouton d'icône", () => {
  const montes: { unmount(): void }[] = [];
  afterEach(() => montes.splice(0).forEach((m) => m.unmount()));

  function boites(): { bouton: DOMRect; icone: DOMRect } {
    const wrapper = mount(UiBouton, {
      props: { variante: "icon" },
      slots: { default: () => h(UiIcone, { nom: "lock" }) },
      attachTo: document.body,
    });
    montes.push(wrapper);
    return {
      bouton: wrapper.element.getBoundingClientRect(),
      icone: wrapper
        .find(".material-symbols-outlined")
        .element.getBoundingClientRect(),
    };
  }

  it("garde l'icône à 24 px", () => {
    const { icone } = boites();
    expect(icone.width).toBe(24);
    expect(icone.height).toBe(24);
  });

  it("centre l'icône sur le calque d'état", () => {
    const { bouton, icone } = boites();
    expect(icone.left + icone.width / 2).toBeCloseTo(
      bouton.left + bouton.width / 2,
      0,
    );
    expect(icone.top + icone.height / 2).toBeCloseTo(
      bouton.top + bouton.height / 2,
      0,
    );
  });
});
