import { flushPromises, mount, type VueWrapper } from "@vue/test-utils";
import { describe, expect, it } from "vitest";
import { nextTick } from "vue";
import { createMemoryHistory, createRouter, type Router } from "vue-router";
import { provideHttpTesting } from "../../core/http/http-testing";
import { inject } from "../../core/injection";
import {
  TAGS_LIENS_PAR_DEFAUT,
  type Cadrage,
  type Referentiel,
} from "../../core/model/model";
import { ReferentielStore } from "../../core/repo/referentiel.store";
import { RepoConfig } from "../../core/repo/repo-config";
import PaletteRecherche, { type DonneesPalette } from "./PaletteRecherche.vue";

/**
 * La palette de recherche — RG-recherche-a-portee-de-clavier, RG-recherche-perimetre, RG-recherche-en-cours-a-part.
 *
 * Ce qui est éprouvé ici, c'est ce que le lecteur voit : les résultats rangés par nature, les cadrages en cours à part, et ce que la palette dit quand elle n'a rien à montrer — un silence passerait pour une recherche en panne.
 */
const VuePlaceholder = { render: () => "vue" };

function cadrage(
  id: string,
  titre: string,
  extra: Partial<Cadrage> = {},
): Cadrage {
  return {
    id,
    titre,
    statut: "livree",
    domaines: [],
    liens: [],
    impacts: [],
    objectif: "",
    parcours: "",
    enonces: new Map(),
    decisions: [],
    piecesJointes: [],
    divers: [],
    ...extra,
  };
}

const REFERENTIEL: Referentiel = {
  projet: { nom: "Test", description: "", depotsCode: [], prefixe: null },
  reglages: {
    acces: "jeton_personnel",
    identite: null,
    protectionDuJeton: "proposee",
    tagsLiens: TAGS_LIENS_PAR_DEFAUT,
  },
  domaines: new Map(),
  fonctionnalites: new Map(),
  regles: new Map([
    [
      "RG-quota",
      {
        id: "RG-quota",
        statut: "actif",
        fonctionnalites: [],
        enonce: "Le quota anonyme est de soixante appels.",
        creePar: null,
        modifiePar: [],
      },
    ],
  ]),
  decisions: new Map(),
  architecture: new Map(),
  cadrages: new Map([
    [
      "2026-006",
      cadrage("2026-006", "Charger un dépôt sans épuiser le quota", {
        decisions: [
          {
            id: "01-canal",
            titre: "Par quel canal lire sans quota ?",
            statut: "retenue",
            optionRetenue: null,
            description: "",
            options: [],
            corps: "",
          },
        ],
      }),
    ],
    [
      "2026-050",
      cadrage("2026-050", "Signaler le quota plus tôt", {
        statut: "en_relecture",
        provenance: {
          branche: "cadrage-2026-050",
          pullRequest: 61,
          brouillon: false,
        },
      }),
    ],
  ]),
  anomalies: [],
};

describe("La palette de recherche", () => {
  let router: Router;

  async function monter(
    donnees: DonneesPalette = { surEtatPasse: false },
  ): Promise<VueWrapper> {
    provideHttpTesting();
    // Le `{ path: '**' }` de SSK Canon : toute adresse mène à une vue sans garde, la palette seule est éprouvée.
    router = createRouter({
      history: createMemoryHistory(),
      routes: [{ path: "/:autre(.*)*", component: VuePlaceholder }],
    });
    await router.push("/");
    await router.isReady();
    inject(RepoConfig).saveDepot({ owner: "org", repo: "depot" });
    inject(ReferentielStore).referentiel.set(REFERENTIEL);
    return mount(PaletteRecherche, {
      props: { data: donnees },
      global: { plugins: [router] },
    });
  }

  async function taper(f: VueWrapper, texte: string): Promise<HTMLElement> {
    const champ = f.element.querySelector("input")!;
    champ.value = texte;
    champ.dispatchEvent(new Event("input"));
    await nextTick();
    return f.element as HTMLElement;
  }

  function titresGroupes(el: HTMLElement): string[] {
    return [...el.querySelectorAll(".groupe-titre")].map(
      (g) => g.textContent?.trim() ?? "",
    );
  }

  it("dit sur quoi elle cherche avant qu’on tape", async () => {
    const el = (await monter()).element as HTMLElement;

    const texte = el.textContent ?? "";
    for (const nature of ["règles", "décisions", "architecture", "cadrages"]) {
      expect(texte).toContain(nature);
    }
    expect(el.querySelectorAll('[role="option"]').length).toBe(0);
  });

  it("range les résultats par nature, et les cadrages en cours à part", async () => {
    const el = await taper(await monter(), "quota");

    expect(titresGroupes(el)).toEqual([
      "Règles de gestion",
      "Décisions",
      "Cadrages",
      "En cours",
    ]);
    const enCours = el.querySelector(".groupe.en-cours")!;
    expect(enCours.textContent).toContain("2026-050");
    expect(enCours.textContent).toContain("#61");
    // un cadrage en discussion ne se mêle jamais au référentiel
    const livres = [...el.querySelectorAll(".groupe:not(.en-cours)")].map(
      (g) => g.textContent,
    );
    expect(livres.join(" ")).not.toContain("2026-050");
  });

  it("dit qu’aucun résultat ne correspond, et rappelle sur quoi elle cherche", async () => {
    const el = await taper(await monter(), "introuvable");

    expect(el.querySelector(".vide")?.textContent).toContain("introuvable");
    expect(el.querySelector(".vide")?.textContent).toContain(
      "cadrages en cours",
    );
  });

  it("dit que les cadrages en cours arrivent encore", async () => {
    const f = await monter();
    inject(ReferentielStore).branchesEnChargement.set(true);
    const el = await taper(f, "soixante");

    expect(el.querySelector(".groupe.en-cours")?.textContent).toContain(
      "Lecture des branches",
    );
    // et ne cache pas ce qui est déjà trouvé
    expect(el.textContent).toContain("RG-quota");
  });

  it("prévient que ses résultats valent pour aujourd’hui quand on remonte le temps", async () => {
    const el = (await monter({ surEtatPasse: true })).element as HTMLElement;

    expect(el.querySelector(".etat-courant")?.textContent).toContain(
      "aujourd’hui",
    );
  });

  it("ne le dit pas sur l’état courant", async () => {
    const el = (await monter()).element as HTMLElement;

    expect(el.querySelector(".etat-courant")).toBeNull();
  });

  it("mène au résultat choisi au clavier, à son ancre, et se referme", async () => {
    const f = await monter();
    const el = await taper(f, "quota");
    const champ = el.querySelector("input")!;

    champ.dispatchEvent(new KeyboardEvent("keydown", { key: "ArrowDown" }));
    await nextTick();
    champ.dispatchEvent(new KeyboardEvent("keydown", { key: "Enter" }));
    await flushPromises();

    // la règle vient en tête, la décision du cadrage juste après
    expect(router.currentRoute.value.fullPath).toBe(
      "/org/depot/cadrages/2026-006#decision-01-canal",
    );
    expect(f.emitted("fermer")).toHaveLength(1);
  });
});
