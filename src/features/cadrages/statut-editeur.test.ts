import { flushPromises, mount, type VueWrapper } from "@vue/test-utils";
import { describe, expect, it } from "vitest";
import { createMemoryHistory } from "vue-router";
import { provideHttpTesting } from "../../core/http/http-testing";
import { inject, provide } from "../../core/injection";
import {
  TAGS_LIENS_PAR_DEFAUT,
  type Cadrage,
  type Referentiel,
} from "../../core/model/model";
import {
  RedactionService,
  listBascules,
} from "../../core/repo/redaction.service";
import { ReferentielStore } from "../../core/repo/referentiel.store";
import { RepoConfig } from "../../core/repo/repo-config";
import { createRouteur } from "../../routeur";
import EditerCadragePage from "./EditerCadragePage.vue";

/**
 * Le statut dans l'éditeur — RG-statuts-cadrage et RG-bascule-de-statut.
 *
 * Le statut ne s'écrit plus dans le fichier : il se lit sur la demande de fusion. L'éditeur le lisait encore dans un champ `statut:` que plus aucun cadrage ne porte, et montrait donc « Brouillon » quoi qu'il en soit — avec, en face, une bascule vers la relecture même pour un cadrage déjà relu.
 */

const CONTENU = `---
id: 2026-050
titre: Un cadrage en relecture
domaines: [d]
---

## Objectif

Un objectif.
`;

function cadrage(statut: Cadrage["statut"]): Cadrage {
  return {
    id: "2026-050",
    titre: "Un cadrage en relecture",
    statut,
    domaines: ["d"],
    liens: [],
    impacts: [],
    objectif: "Un objectif.",
    parcours: "",
    enonces: new Map(),
    decisions: [],
    piecesJointes: [],
    divers: [],
    provenance: {
      branche: "cadrage/2026-050",
      pullRequest: 9,
      brouillon: statut === "brouillon",
    },
  };
}

function referentiel(cadrages: Cadrage[]): Referentiel {
  return {
    projet: { nom: "Essai", description: "", depotsCode: [], prefixe: null },
    reglages: {
      acces: "jeton_personnel",
      identite: null,
      protectionDuJeton: "proposee",
      tagsLiens: TAGS_LIENS_PAR_DEFAUT,
    },
    domaines: new Map([["d", { id: "d", nom: "D", description: "" }]]),
    fonctionnalites: new Map(),
    regles: new Map(),
    decisions: new Map(),
    architecture: new Map(),
    cadrages: new Map(cadrages.map((c) => [c.id, c])),
    anomalies: [],
  };
}

describe("Le statut dans l’éditeur", () => {
  async function monter(cadrages: Cadrage[]): Promise<VueWrapper> {
    provideHttpTesting();
    provide(RedactionService, {
      loadPourEdition: async () => ({
        source: {
          branche: "cadrage/2026-050",
          chemin: "cadrages/2026-050/cadrage.md",
          sha: "x",
        },
        contenu: CONTENU,
        contexte: null,
        branchePrincipale: "main",
      }),
      loadDecisions: async () => [],
      transitionsPossibles: listBascules,
    });
    inject(RepoConfig).saveDepot({ owner: "org", repo: "depot" });
    const store = inject(ReferentielStore);
    store.referentiel.set(referentiel(cadrages));
    store.etat.set("pret");

    const router = createRouteur(createMemoryHistory());
    await router.push("/org/depot/cadrages/2026-050/editer");
    await router.isReady();
    return mount(EditerCadragePage, { global: { plugins: [router] } });
  }

  async function stable(f: VueWrapper): Promise<HTMLElement> {
    for (let i = 0; i < 10; i++) await Promise.resolve();
    await flushPromises();
    return f.element as HTMLElement;
  }

  function statutAffiche(el: HTMLElement): string {
    return el.querySelector(".cycle-etat strong")?.textContent?.trim() ?? "";
  }

  function bascules(el: HTMLElement): string[] {
    return [...el.querySelectorAll(".cycle-actions button")].map(
      (b) => b.textContent?.trim() ?? "",
    );
  }

  it("montre le statut que porte la demande de fusion", async () => {
    const el = await stable(await monter([cadrage("en_relecture")]));

    expect(statutAffiche(el)).toBe("En relecture");
    expect(bascules(el)).toEqual(["Brouillon"]);
  });

  it("ne propose jamais « Validée », et laisse reprendre un cadrage validé", async () => {
    const el = await stable(await monter([cadrage("validee")]));

    expect(statutAffiche(el)).toBe("Validée");
    expect(bascules(el)).toEqual(["Brouillon"]);
  });

  it("suit le statut quand les branches finissent d’arriver", async () => {
    const f = await monter([]);
    let el = await stable(f);
    expect(statutAffiche(el)).toBe("Brouillon");

    const store = inject(ReferentielStore);
    store.referentiel.set(referentiel([cadrage("en_relecture")]));
    el = await stable(f);

    expect(statutAffiche(el)).toBe("En relecture");
  });
});
