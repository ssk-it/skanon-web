import { mount } from "@vue/test-utils";
import { afterEach, describe, expect, it } from "vitest";
import { userEvent } from "vitest/browser";
import "../styles.css";
import UiTextField from "./UiTextField.vue";

/**
 * A secret is masked without a password field, which the browser's password manager would offer to save (2026-055 decision 01). Whether the discs are drawn is up to the engine's CSS, which jsdom does not apply.
 */
describe("secret text field", () => {
  const mounted: { unmount(): void }[] = [];
  afterEach(() => mounted.splice(0).forEach((m) => m.unmount()));

  function secretField(): HTMLInputElement {
    const wrapper = mount(UiTextField, {
      props: { label: "Jeton", secret: true },
      attachTo: document.body,
    });
    mounted.push(wrapper);
    return wrapper.find("input").element;
  }

  it("draws the typed secret in discs, in a text field", async () => {
    const field = secretField();
    await userEvent.type(field, "ghp_secret");
    expect(field.type).toBe("text");
    expect(field.value).toBe("ghp_secret");
    expect(
      getComputedStyle(field).getPropertyValue("-webkit-text-security"),
    ).toBe("disc");
  });
});
