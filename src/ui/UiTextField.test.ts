import { mount } from "@vue/test-utils";
import { describe, expect, it } from "vitest";
import UiTextField from "./UiTextField.vue";

/**
 * RG-accessibilite-aa, 3.3.1 and 1.3.1: a screen reader reads the error or the hint with the field, not only when it moves below it.
 */
describe("text field", () => {
  function description(props: Record<string, unknown>): string | null {
    const view = mount(UiTextField, { props: { label: "Jeton", ...props } });
    const ids = view.find("input").attributes("aria-describedby");
    if (!ids) return null;
    return ids
      .split(" ")
      .map((id) => view.find(`[id="${id}"]`).text())
      .join(" ");
  }

  it("ties the error to the field it concerns", () => {
    expect(description({ error: "Ce jeton a expiré." })).toBe(
      "Ce jeton a expiré.",
    );
  });

  it("ties the hint to the field", () => {
    expect(description({ hint: "Commence par github_pat_." })).toBe(
      "Commence par github_pat_.",
    );
  });

  it("describes nothing when there is nothing to say", () => {
    expect(description({})).toBeNull();
  });
});
