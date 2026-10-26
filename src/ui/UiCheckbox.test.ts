import { mount } from "@vue/test-utils";
import { describe, expect, it } from "vitest";
import UiCheckbox from "./UiCheckbox.vue";

describe("UiCheckbox", () => {
  it("names its control by the slotted label, through aria-labelledby", () => {
    const wrapper = mount(UiCheckbox, {
      slots: { default: "Load contents through the API" },
      attachTo: document.body,
    });
    const input = wrapper.get("input");
    const labelledBy = input.attributes("aria-labelledby");

    expect(labelledBy).toBeTruthy();
    expect(document.getElementById(labelledBy!)?.textContent).toBe(
      "Load contents through the API",
    );
    wrapper.unmount();
  });

  it("toggles its model when the label text is clicked", async () => {
    const wrapper = mount(UiCheckbox, {
      props: { modelValue: false },
      slots: { default: "Load contents through the API" },
      attachTo: document.body,
    });

    await wrapper.get(".ui-case__libelle").trigger("click");

    expect(wrapper.emitted("update:modelValue")).toEqual([[true]]);
    wrapper.unmount();
  });
});
