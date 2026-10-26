import { flushPromises, mount, type VueWrapper } from "@vue/test-utils";
import { afterEach, describe, expect, it } from "vitest";
import { defineComponent, h, nextTick } from "vue";
import { inject } from "../core/injection";
import { DialogService } from "./dialog.service";
import UiDialogHost from "./UiDialogHost.vue";

/** Un dialogue d'essai : un champ, deux boutons, et ce qu'il a reçu. */
const Sample = defineComponent({
  props: { data: { type: Object, default: null } },
  emits: ["close"],
  setup(props, { emit }) {
    return () =>
      h("div", { class: "essai" }, [
        h("p", { class: "recu" }, String(props.data?.["message"] ?? "")),
        h("input", { class: "premier" }),
        h(
          "button",
          {
            class: "non",
            // Le focus initial se demande par les données : c'est tout ce qu'un dialogue reçoit.
            "data-focus-initial": props.data?.["focusInitial"] ? "" : undefined,
            onClick: () => emit("close", false),
          },
          "Non",
        ),
        h(
          "button",
          { class: "oui", onClick: () => emit("close", true) },
          "Oui",
        ),
      ]);
  },
});

let host: VueWrapper | null = null;

function mountView(): DialogService {
  host = mount(UiDialogHost, { attachTo: document.body });
  return inject(DialogService);
}

function panel(): HTMLElement | null {
  return document.querySelector<HTMLElement>(".ui-dialog-panneau");
}

function pressKey(target: Element, key: string, shiftKey = false): void {
  target.dispatchEvent(
    new KeyboardEvent("keydown", {
      key,
      shiftKey,
      bubbles: true,
      cancelable: true,
    }),
  );
}

afterEach(() => {
  host?.unmount();
  host = null;
  document.body.innerHTML = "";
});

describe("DialogService", () => {
  it("monte le composant avec ses données, et rend le résultat qu’il émet", async () => {
    const dialogs = mountView();
    const result = dialogs.open<boolean>(Sample, {
      data: { message: "Bonjour" },
    });
    await flushPromises();

    expect(panel()?.querySelector(".recu")?.textContent).toBe("Bonjour");
    panel()!.querySelector<HTMLButtonElement>(".oui")!.click();

    expect(await result).toBe(true);
    await nextTick();
    expect(panel()).toBeNull();
  });

  it("ferme sans réponse à Échap", async () => {
    const dialogs = mountView();
    const result = dialogs.open(Sample);
    await flushPromises();

    pressKey(panel()!.querySelector(".premier")!, "Escape");

    expect(await result).toBeUndefined();
    await nextTick();
    expect(panel()).toBeNull();
  });

  it("ferme sans réponse au clic sur le fond", async () => {
    const dialogs = mountView();
    const result = dialogs.open(Sample);
    await flushPromises();

    document.querySelector<HTMLElement>(".ui-dialog-fond")!.click();

    expect(await result).toBeUndefined();
  });

  it("ne ferme pas au clic dans le panneau", async () => {
    const dialogs = mountView();
    void dialogs.open(Sample);
    await flushPromises();

    panel()!.querySelector<HTMLElement>(".recu")!.click();
    await nextTick();

    expect(panel()).not.toBeNull();
  });

  it("donne le focus au premier élément focalisable, ou au panneau sur demande", async () => {
    const dialogs = mountView();
    void dialogs.open(Sample);
    await flushPromises();
    expect(document.activeElement?.className).toBe("premier");

    dialogs.closeAll();
    await flushPromises();
    void dialogs.open(Sample, { focus: "dialogue" });
    await flushPromises();
    expect(document.activeElement).toBe(panel());
  });

  it("préfère l’élément marqué pour le focus initial", async () => {
    const dialogs = mountView();
    void dialogs.open(Sample, { data: { focusInitial: true } });
    await flushPromises();

    expect(document.activeElement?.className).toBe("non");
  });

  it("piège le focus : Tab boucle du dernier élément au premier, et l’inverse", async () => {
    const dialogs = mountView();
    void dialogs.open(Sample);
    await flushPromises();

    const yes = panel()!.querySelector<HTMLButtonElement>(".oui")!;
    yes.focus();
    pressKey(yes, "Tab");
    expect(document.activeElement?.className).toBe("premier");

    pressKey(document.activeElement!, "Tab", true);
    expect(document.activeElement).toBe(yes);
  });

  it("rend le focus à l’élément qui l’avait avant l’ouverture", async () => {
    const dialogs = mountView();
    const trigger = document.createElement("button");
    document.body.appendChild(trigger);
    trigger.focus();

    const result = dialogs.open(Sample);
    await flushPromises();
    expect(document.activeElement).not.toBe(trigger);

    pressKey(panel()!, "Escape");
    await result;
    await flushPromises();
    expect(document.activeElement).toBe(trigger);
  });

  it("n’écoute Échap que dans le dernier dialogue ouvert", async () => {
    const dialogs = mountView();
    const first = dialogs.open(Sample, { data: { message: "1" } });
    const second = dialogs.open(Sample, { data: { message: "2" } });
    await flushPromises();

    const panels = document.querySelectorAll<HTMLElement>(".ui-dialog-panneau");
    expect(panels).toHaveLength(2);
    pressKey(panels[1]!, "Escape");

    expect(await second).toBeUndefined();
    await nextTick();
    expect(dialogs.openDialogs()).toHaveLength(1);
    expect(document.querySelector(".recu")?.textContent).toBe("1");

    dialogs.closeAll();
    expect(await first).toBeUndefined();
  });

  it("pose la largeur, la position et le nom demandés", async () => {
    const dialogs = mountView();
    void dialogs.open(Sample, {
      width: "640px",
      maxWidth: "calc(100vw - 32px)",
      top: "12vh",
      className: "palette-recherche",
      label: "Rechercher dans le référentiel",
    });
    await flushPromises();

    const p = panel()!;
    expect(p.style.width).toBe("640px");
    expect(p.style.maxWidth).toBe("calc(100vw - 32px)");
    expect(p.style.marginTop).toBe("12vh");
    expect(p.classList).toContain("palette-recherche");
    expect(p.getAttribute("aria-label")).toBe("Rechercher dans le référentiel");
    expect(p.getAttribute("role")).toBe("dialog");
    expect(p.getAttribute("aria-modal")).toBe("true");
  });

  it("ignore une seconde fermeture : la promesse ne se résout qu’une fois", async () => {
    const dialogs = mountView();
    const result = dialogs.open<boolean>(Sample);
    await flushPromises();

    const [opened] = dialogs.openDialogs();
    opened!.close(true);
    opened!.close(false);

    expect(await result).toBe(true);
  });
});
