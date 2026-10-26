import { flushPromises, mount } from "@vue/test-utils";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { userEvent } from "vitest/browser";
import { TokenService } from "../../core/github/token.service";
import { inject, resetInjection } from "../../core/injection";
import PasskeyUnlock from "./PasskeyUnlock.vue";

/**
 * The field where the browser's autofill lists the passkey (2026-065, decision 02): reached with the keyboard, but nothing typed in it, nor shown — RG-accessibilite-aa. Real keystrokes, in WebKit.
 */
describe("passkey field, with the keyboard", () => {
  const mounted: { unmount(): void }[] = [];
  afterEach(() => mounted.splice(0).forEach((m) => m.unmount()));

  beforeEach(() => {
    resetInjection();
    const tokens = inject(TokenService);
    vi.spyOn(tokens, "canOffer").mockResolvedValue(true);
    vi.spyOn(tokens, "offerUnlock").mockReturnValue(new Promise(() => {}));
  });

  async function field(): Promise<HTMLInputElement> {
    const wrapper = mount(PasskeyUnlock, { attachTo: document.body });
    mounted.push(wrapper);
    await flushPromises();
    return wrapper.find("input").element;
  }

  it("is reached with the Tab key", async () => {
    const input = await field();
    (document.activeElement as HTMLElement | null)?.blur();
    await userEvent.tab();
    expect(document.activeElement).toBe(input);
  });

  it("keeps empty whatever is typed in it", async () => {
    const input = await field();
    await userEvent.click(input);
    await userEvent.keyboard("ghp_secret");
    expect(input.value).toBe("");
  });
});
