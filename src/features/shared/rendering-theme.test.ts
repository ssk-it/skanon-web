import { flushPromises, mount } from "@vue/test-utils";
import { beforeAll, describe, expect, it } from "vitest";
import { nextTick } from "vue";
import { inject } from "../../core/injection";
import { ThemeService } from "../../core/ui/theme.service";
import RenderedMarkdown from "./RenderedMarkdown.vue";

const TEXT = "Un texte.\n\n```mermaid\nflowchart LR\n  A --> B\n```";

/**
 * The component's behaviour around the rendering.
 *
 * The drawing itself is not tested here: the engine measures text through `getBBox`, which the test environment does not implement. What is tested is what surrounds it — that the rest of the page survives, and that a faulty diagram reports itself where it was to appear.
 */
// Mermaid weighs several megabytes, and `RenderedMarkdown` loads it on demand: under the load of the whole suite, this first load alone exceeded a test's timeout (observed once in six). Loading it beforehand, with its own timeout, leaves the tests only the behaviour to test.
beforeAll(async () => {
  await import("mermaid");
}, 60_000);

describe("rendering component", () => {
  it("leaves the page readable when a diagram cannot be drawn", async () => {
    const view = mount(RenderedMarkdown, { props: { text: TEXT } });
    await flushPromises();
    await new Promise((r) => setTimeout(r, 300));

    const html = view.html();
    // The point remains: a diagram illustrates, it does not carry.
    expect(html).toContain("Un texte.");
    // And the failure says so, rather than leaving a gap one would take for a scoping that wrote nothing at that place.
    expect(html).toContain("pc-diagramme-erreur");
  });

  it("follows the application's effective theme", async () => {
    const theme = inject(ThemeService);
    const view = mount(RenderedMarkdown, { props: { text: TEXT } });

    theme.theme.set("sombre");
    await nextTick();
    await new Promise((r) => setTimeout(r, 200));

    // The theme is read in the rendering effect: a toggle reruns it. Without that, the diagrams already displayed would stay in the old theme.
    expect(theme.effective()).toBe("sombre");
    expect(view.html()).toContain("Un texte.");
  });
});
