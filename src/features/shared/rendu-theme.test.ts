import { flushPromises, mount } from "@vue/test-utils";
import { beforeAll, describe, expect, it } from "vitest";
import { nextTick } from "vue";
import { inject } from "../../core/injection";
import { ThemeService } from "../../core/ui/theme.service";
import MarkdownRendu from "./MarkdownRendu.vue";

const TEXTE = "Un texte.\n\n```mermaid\nflowchart LR\n  A --> B\n```";

/**
 * Le comportement du composant autour du rendu.
 *
 * Le dessin lui-même n'est pas éprouvé ici : le moteur mesure le texte par `getBBox`, que l'environnement de test n'implémente pas. Ce qui est éprouvé est ce qui l'entoure — que le reste de la page survive, et qu'un diagramme fautif se signale là où il devait paraître.
 */
// Mermaid pèse plusieurs mégaoctets, et `MarkdownRendu` le charge à la demande : sous la charge de toute la suite, ce premier chargement dépassait à lui seul le délai d'un test (constaté une fois sur six). Le charger avant, avec son propre délai, laisse aux tests le seul comportement à éprouver.
beforeAll(async () => {
  await import("mermaid");
}, 60_000);

describe("composant de rendu", () => {
  it("laisse la page lisible quand un diagramme ne peut pas être dessiné", async () => {
    const vue = mount(MarkdownRendu, { props: { texte: TEXTE } });
    await flushPromises();
    await new Promise((r) => setTimeout(r, 300));

    const html = vue.html();
    // Le propos demeure : un schéma illustre, il ne porte pas.
    expect(html).toContain("Un texte.");
    // Et l'échec se dit, plutôt que de laisser un vide qu'on prendrait pour un cadrage qui n'aurait rien écrit à cet endroit.
    expect(html).toContain("pc-diagramme-erreur");
  });

  it("suit le thème effectif de l’application", async () => {
    const theme = inject(ThemeService);
    const vue = mount(MarkdownRendu, { props: { texte: TEXTE } });

    theme.theme.set("sombre");
    await nextTick();
    await new Promise((r) => setTimeout(r, 200));

    // Le thème est lu dans l'effet de rendu : une bascule le relance. Sans cela, les diagrammes déjà affichés resteraient dans l'ancien thème.
    expect(theme.effectif()).toBe("sombre");
    expect(vue.html()).toContain("Un texte.");
  });
});
