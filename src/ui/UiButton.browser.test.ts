import { mount } from "@vue/test-utils";
import { afterEach, describe, expect, it } from "vitest";
import { h } from "vue";
import "../styles.css";
import UiButton from "./UiButton.vue";
import UiIcon from "./UiIcon.vue";

/**
 * The state layer of an icon button is a disc centred on the button: the icon must be too, at its `mat-icon` size. Off-centre, it goes outside the disc on hover — a defect only layout reveals, and that jsdom does not compute.
 */
describe("icon button", () => {
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

  it("keeps the icon at 24 px", () => {
    const { icon } = boxes();
    expect(icon.width).toBe(24);
    expect(icon.height).toBe(24);
  });

  it("centres the icon on the state layer", () => {
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
