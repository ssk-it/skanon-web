import { mount, type VueWrapper } from "@vue/test-utils";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { createMemoryHistory, createRouter, type Router } from "vue-router";
import App from "../../App.vue";
import { provideHttpTesting } from "../../core/http/http-testing";
import { inject } from "../../core/injection";
import { DialogService } from "../../ui/dialog.service";

/**
 * L'accès à la recherche — RG-recherche-a-portee-de-clavier.
 *
 * Un raccourci depuis toute vue d'un projet, et une icône pour qui n'a pas de clavier ou ne connaît pas le raccourci. Rien hors d'un projet : il n'y aurait rien dans quoi chercher.
 *
 * `pc-palette-recherche`, l'hôte Angular, est ici la racine `.palette-recherche` du composant, dans le panneau du dialogue — qui porte lui aussi cette classe, d'où le sélecteur `PALETTE`.
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

/** Laisse le temps à l'import différé de la palette d'aboutir. */
async function waitForOpen(): Promise<void> {
  for (let i = 0; i < 20 && !document.querySelector(PALETTE); i++) {
    await new Promise((r) => setTimeout(r, 10));
  }
}

describe("Accès à la recherche", () => {
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

  it("propose une icône de recherche dans un projet", async () => {
    const f = await mountView("/test/test/referentiel");

    // La coquille a plusieurs racines : `find` les parcourt toutes.
    const button = f.find<HTMLButtonElement>("button.recherche");
    expect(button.exists()).toBe(true);

    button.element.click();
    await waitForOpen();
    expect(document.querySelector(PALETTE)).not.toBeNull();
  });

  it("s’ouvre au raccourci clavier", async () => {
    await mountView("/test/test/cadrages");

    const e = shortcut();
    document.dispatchEvent(e);
    await waitForOpen();

    expect(document.querySelector(PALETTE)).not.toBeNull();
    // le navigateur ne doit pas en faire autre chose
    expect(e.defaultPrevented).toBe(true);
  });

  it("ne s’ouvre qu’une fois, même au raccourci répété", async () => {
    await mountView("/test/test/cadrages");

    document.dispatchEvent(shortcut());
    document.dispatchEvent(shortcut());
    await waitForOpen();
    await new Promise((r) => setTimeout(r, 30));

    expect(document.querySelectorAll(PALETTE).length).toBe(1);
  });

  it("n’est pas proposée hors d’un projet", async () => {
    const f = await mountView("/");

    expect(f.find("button.recherche").exists()).toBe(false);
    document.dispatchEvent(shortcut());
    await new Promise((r) => setTimeout(r, 50));
    expect(document.querySelector(PALETTE)).toBeNull();
  });

  it("prévient que la recherche porte sur aujourd’hui depuis la vue d’évolution", async () => {
    await mountView("/test/test/evolution");

    document.dispatchEvent(shortcut());
    await waitForOpen();

    expect(document.querySelector(`${PALETTE} .etat-courant`)).not.toBeNull();
  });
});
