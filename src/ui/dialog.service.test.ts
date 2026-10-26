import { flushPromises, mount, type VueWrapper } from "@vue/test-utils";
import { afterEach, describe, expect, it } from "vitest";
import { defineComponent, h, nextTick } from "vue";
import { inject } from "../core/injection";
import { DialogService } from "./dialog.service";
import UiDialogHote from "./UiDialogHote.vue";

/** Un dialogue d'essai : un champ, deux boutons, et ce qu'il a reçu. */
const Essai = defineComponent({
  props: { data: { type: Object, default: null } },
  emits: ["fermer"],
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
            onClick: () => emit("fermer", false),
          },
          "Non",
        ),
        h(
          "button",
          { class: "oui", onClick: () => emit("fermer", true) },
          "Oui",
        ),
      ]);
  },
});

let hote: VueWrapper | null = null;

function monter(): DialogService {
  hote = mount(UiDialogHote, { attachTo: document.body });
  return inject(DialogService);
}

function panneau(): HTMLElement | null {
  return document.querySelector<HTMLElement>(".ui-dialog-panneau");
}

function touche(cible: Element, key: string, shiftKey = false): void {
  cible.dispatchEvent(
    new KeyboardEvent("keydown", {
      key,
      shiftKey,
      bubbles: true,
      cancelable: true,
    }),
  );
}

afterEach(() => {
  hote?.unmount();
  hote = null;
  document.body.innerHTML = "";
});

describe("DialogService", () => {
  it("monte le composant avec ses données, et rend le résultat qu’il émet", async () => {
    const dialogues = monter();
    const resultat = dialogues.open<boolean>(Essai, {
      data: { message: "Bonjour" },
    });
    await flushPromises();

    expect(panneau()?.querySelector(".recu")?.textContent).toBe("Bonjour");
    panneau()!.querySelector<HTMLButtonElement>(".oui")!.click();

    expect(await resultat).toBe(true);
    await nextTick();
    expect(panneau()).toBeNull();
  });

  it("ferme sans réponse à Échap", async () => {
    const dialogues = monter();
    const resultat = dialogues.open(Essai);
    await flushPromises();

    touche(panneau()!.querySelector(".premier")!, "Escape");

    expect(await resultat).toBeUndefined();
    await nextTick();
    expect(panneau()).toBeNull();
  });

  it("ferme sans réponse au clic sur le fond", async () => {
    const dialogues = monter();
    const resultat = dialogues.open(Essai);
    await flushPromises();

    document.querySelector<HTMLElement>(".ui-dialog-fond")!.click();

    expect(await resultat).toBeUndefined();
  });

  it("ne ferme pas au clic dans le panneau", async () => {
    const dialogues = monter();
    void dialogues.open(Essai);
    await flushPromises();

    panneau()!.querySelector<HTMLElement>(".recu")!.click();
    await nextTick();

    expect(panneau()).not.toBeNull();
  });

  it("donne le focus au premier élément focalisable, ou au panneau sur demande", async () => {
    const dialogues = monter();
    void dialogues.open(Essai);
    await flushPromises();
    expect(document.activeElement?.className).toBe("premier");

    dialogues.closeAll();
    await flushPromises();
    void dialogues.open(Essai, { focus: "dialogue" });
    await flushPromises();
    expect(document.activeElement).toBe(panneau());
  });

  it("préfère l’élément marqué pour le focus initial", async () => {
    const dialogues = monter();
    void dialogues.open(Essai, { data: { focusInitial: true } });
    await flushPromises();

    expect(document.activeElement?.className).toBe("non");
  });

  it("piège le focus : Tab boucle du dernier élément au premier, et l’inverse", async () => {
    const dialogues = monter();
    void dialogues.open(Essai);
    await flushPromises();

    const oui = panneau()!.querySelector<HTMLButtonElement>(".oui")!;
    oui.focus();
    touche(oui, "Tab");
    expect(document.activeElement?.className).toBe("premier");

    touche(document.activeElement!, "Tab", true);
    expect(document.activeElement).toBe(oui);
  });

  it("rend le focus à l’élément qui l’avait avant l’ouverture", async () => {
    const dialogues = monter();
    const declencheur = document.createElement("button");
    document.body.appendChild(declencheur);
    declencheur.focus();

    const resultat = dialogues.open(Essai);
    await flushPromises();
    expect(document.activeElement).not.toBe(declencheur);

    touche(panneau()!, "Escape");
    await resultat;
    await flushPromises();
    expect(document.activeElement).toBe(declencheur);
  });

  it("n’écoute Échap que dans le dernier dialogue ouvert", async () => {
    const dialogues = monter();
    const premier = dialogues.open(Essai, { data: { message: "1" } });
    const second = dialogues.open(Essai, { data: { message: "2" } });
    await flushPromises();

    const panneaux =
      document.querySelectorAll<HTMLElement>(".ui-dialog-panneau");
    expect(panneaux).toHaveLength(2);
    touche(panneaux[1]!, "Escape");

    expect(await second).toBeUndefined();
    await nextTick();
    expect(dialogues.ouverts()).toHaveLength(1);
    expect(document.querySelector(".recu")?.textContent).toBe("1");

    dialogues.closeAll();
    expect(await premier).toBeUndefined();
  });

  it("pose la largeur, la position et le nom demandés", async () => {
    const dialogues = monter();
    void dialogues.open(Essai, {
      largeur: "640px",
      largeurMax: "calc(100vw - 32px)",
      haut: "12vh",
      classe: "palette-recherche",
      libelle: "Rechercher dans le référentiel",
    });
    await flushPromises();

    const p = panneau()!;
    expect(p.style.width).toBe("640px");
    expect(p.style.maxWidth).toBe("calc(100vw - 32px)");
    expect(p.style.marginTop).toBe("12vh");
    expect(p.classList).toContain("palette-recherche");
    expect(p.getAttribute("aria-label")).toBe("Rechercher dans le référentiel");
    expect(p.getAttribute("role")).toBe("dialog");
    expect(p.getAttribute("aria-modal")).toBe("true");
  });

  it("ignore une seconde fermeture : la promesse ne se résout qu’une fois", async () => {
    const dialogues = monter();
    const resultat = dialogues.open<boolean>(Essai);
    await flushPromises();

    const [ouvert] = dialogues.ouverts();
    ouvert!.fermer(true);
    ouvert!.fermer(false);

    expect(await resultat).toBe(true);
  });
});
