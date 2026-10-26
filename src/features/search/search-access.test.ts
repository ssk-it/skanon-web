import { mount, type VueWrapper } from "@vue/test-utils";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { createMemoryHistory, createRouter, type Router } from "vue-router";
import App from "../../App.vue";
import { provideHttpTesting } from "../../core/http/http-testing";
import { inject } from "../../core/injection";
import { DialogService } from "../../ui/dialog.service";

/**
 * Access to search — RG-recherche-a-portee-de-clavier.
 *
 * A shortcut from any view of a project, and an icon for those without a keyboard or who do not know the shortcut. Nothing outside a project: there would be nothing to search in.
 *
 * `pc-palette-recherche`, the Angular host, is here the component's `.palette-recherche` root, inside the dialog panel — which carries that class too, hence the `PALETTE` selector.
 */
const VuePlaceholder = { render: () => "vue" };

const PALETTE = ".ui-dialog-panneau > .palette-recherche";

const MAC = /Mac|iPhone|iPad/.test(navigator.platform);

function shortcut(): KeyboardEvent {
  return new KeyboardEvent("keydown", {
    key: "k",
    metaKey: MAC,
    ctrlKey: !MAC,
    bubbles: true,
    cancelable: true,
  });
}

/** Gives the palette's deferred import time to complete. */
async function waitForOpen(): Promise<void> {
  for (let i = 0; i < 20 && !document.querySelector(PALETTE); i++) {
    await new Promise((r) => setTimeout(r, 10));
  }
}

describe("Search access", () => {
  let router: Router;
  let view: VueWrapper | null = null;

  beforeEach(() => {
    provideHttpTesting();
    router = createRouter({
      history: createMemoryHistory(),
      routes: [
        { path: "/", component: VuePlaceholder },
        { path: "/:owner/:repo/:vue", component: VuePlaceholder },
      ],
    });
  });

  afterEach(() => {
    inject(DialogService).closeAll();
    view?.unmount();
    view = null;
  });

  async function mountView(url: string): Promise<VueWrapper> {
    await router.push(url);
    await router.isReady();
    view = mount(App, { global: { plugins: [router] } });
    return view;
  }

  it("offers a search icon within a project", async () => {
    const f = await mountView("/test/test/referentiel");

    // The shell has several roots: `find` goes through all of them.
    const button = f.find<HTMLButtonElement>("button.recherche");
    expect(button.exists()).toBe(true);

    button.element.click();
    await waitForOpen();
    expect(document.querySelector(PALETTE)).not.toBeNull();
  });

  it("opens on the keyboard shortcut", async () => {
    await mountView("/test/test/cadrages");

    const e = shortcut();
    document.dispatchEvent(e);
    await waitForOpen();

    expect(document.querySelector(PALETTE)).not.toBeNull();
    // the browser must not do anything else with it
    expect(e.defaultPrevented).toBe(true);
  });

  it("opens only once, even on a repeated shortcut", async () => {
    await mountView("/test/test/cadrages");

    document.dispatchEvent(shortcut());
    document.dispatchEvent(shortcut());
    await waitForOpen();
    await new Promise((r) => setTimeout(r, 30));

    expect(document.querySelectorAll(PALETTE).length).toBe(1);
  });

  it("is not offered outside a project", async () => {
    const f = await mountView("/");

    expect(f.find("button.recherche").exists()).toBe(false);
    document.dispatchEvent(shortcut());
    await new Promise((r) => setTimeout(r, 50));
    expect(document.querySelector(PALETTE)).toBeNull();
  });

  it("warns that search covers today from the evolution view", async () => {
    await mountView("/test/test/evolution");

    document.dispatchEvent(shortcut());
    await waitForOpen();

    expect(document.querySelector(`${PALETTE} .etat-courant`)).not.toBeNull();
  });
});
