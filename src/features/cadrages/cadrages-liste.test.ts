import { flushPromises, mount, type VueWrapper } from "@vue/test-utils";
import { beforeEach, describe, expect, it } from "vitest";
import { nextTick } from "vue";
import { createMemoryHistory, type Router } from "vue-router";
import {
  provideHttpTesting,
  type HttpTestingController,
} from "../../core/http/http-testing";
import { inject } from "../../core/injection";
import {
  TAGS_LIENS_PAR_DEFAUT,
  type Cadrage,
  type Referentiel,
} from "../../core/model/model";
import { ReferentielStore } from "../../core/repo/referentiel.store";
import { RepoConfig } from "../../core/repo/repo-config";
import { createRouteur } from "../../routeur";
import CadragesPage from "./CadragesPage.vue";

/**
 * La liste des cadrages — RG-liste-cadrages-sobre et RG-liste-cadrages-filtrable.
 *
 * Ce qui est éprouvé ici, c'est qu'une ligne ne dit que ce qui la distingue, et que la liste se parcourt par un mot ou un domaine sans perdre son ordre.
 */

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

function impacts(n: number): Cadrage["impacts"] {
  return Array.from({ length: n }, (_, i) => ({
    cible: `RG-${i}`,
    regle: `RG-${i}`,
    nature: "regle" as const,
    operation: "cree" as const,
  }));
}

function decisions(n: number): Cadrage["decisions"] {
  return Array.from({ length: n }, (_, i) => ({
    id: `0${i + 1}-d`,
    titre: "Une question ?",
    statut: "retenue" as const,
    optionRetenue: null,
    description: "",
    options: [],
    corps: "",
  }));
}

const CADRAGES: Cadrage[] = [
  cadrage("2026-005", "Alléger la barre sur écran étroit", {
    statut: "en_relecture",
    domaines: ["referentiel"],
    provenance: {
      branche: "cadrage-2026-005",
      pullRequest: 9,
      brouillon: false,
    },
  }),
  cadrage("2026-004", "Rendre les diagrammes écrits", {
    domaines: ["referentiel", "cadrage"],
    impacts: impacts(3),
    decisions: decisions(2),
  }),
  cadrage("2026-003", "Chiffrer les pièces jointes", {
    domaines: ["persistance"],
    impacts: impacts(1),
    decisions: decisions(1),
  }),
];

function referentiel(): Referentiel {
  const domaine = (id: string, nom: string) =>
    [id, { id, nom, description: "" }] as const;
  return {
    projet: { nom: "Test", description: "", depotsCode: [], prefixe: null },
    reglages: {
      acces: "jeton_personnel",
      identite: null,
      protectionDuJeton: "proposee",
      tagsLiens: TAGS_LIENS_PAR_DEFAUT,
    },
    domaines: new Map([
      domaine("cadrage", "Cadrage"),
      domaine("persistance", "Persistance"),
      domaine("referentiel", "Référentiel"),
    ]),
    fonctionnalites: new Map(),
    regles: new Map(),
    decisions: new Map(),
    architecture: new Map(),
    cadrages: new Map(CADRAGES.map((c) => [c.id, c])),
    anomalies: [],
  };
}

let http: HttpTestingController;
let router: Router;

async function monter(): Promise<VueWrapper> {
  const f = mount(CadragesPage, { global: { plugins: [router] } });
  await nextTick();
  return f;
}

function el(f: VueWrapper): HTMLElement {
  return f.element.parentElement ?? (f.element as HTMLElement);
}

function lignes(f: VueWrapper): string[] {
  return [...el(f).querySelectorAll(".ligne .cid")].map(
    (c) => c.textContent?.trim() ?? "",
  );
}

async function taper(f: VueWrapper, texte: string): Promise<void> {
  const champ = el(f).querySelector<HTMLInputElement>(".filtre input")!;
  champ.value = texte;
  champ.dispatchEvent(new Event("input"));
  await nextTick();
}

function domaine(f: VueWrapper, nom: string): HTMLButtonElement {
  return [
    ...el(f).querySelectorAll<HTMLButtonElement>(".filtre button.domaine"),
  ].find((b) => b.textContent?.includes(nom))!;
}

/** Fait échouer les lectures de dates en vol : chacune rend alors `null`. */
async function refuserDates(): Promise<void> {
  for (let tour = 0; tour < 20; tour++) {
    await Promise.resolve();
    for (const r of http.match((r) => r.url.includes("/commits"))) {
      r.flush("Not Found", { status: 404, statusText: "Not Found" });
    }
  }
  await new Promise((r) => setTimeout(r, 0));
}

describe("La liste des cadrages", () => {
  beforeEach(async () => {
    http = provideHttpTesting();
    inject(RepoConfig).saveDepot({ owner: "org", repo: "depot" });
    const store = inject(ReferentielStore);
    store.referentiel.set(referentiel());
    store.etat.set("pret");
    router = createRouteur(createMemoryHistory());
    await router.push("/org/depot/cadrages");
    await router.isReady();
  });

  describe("une ligne sobre", () => {
    it("nomme ses compteurs", async () => {
      const texte = el(await monter()).textContent ?? "";

      expect(texte).toContain("2 décisions · 3 impacts");
      expect(texte).toContain("1 décision · 1 impact");
    });

    it("ne répète pas le statut des livrés, et garde celui des en cours", async () => {
      const f = await monter();

      const puces = [...el(f).querySelectorAll(".ligne .statut-chip")];
      expect(puces.length).toBe(1);
      expect(puces[0].closest(".ligne")?.textContent).toContain("2026-005");
    });

    it("garde l’identifiant affiché sur chaque ligne", async () => {
      expect(lignes(await monter())).toEqual([
        "2026-005",
        "2026-004",
        "2026-003",
      ]);
    });

    it("réunit les livrés sous « Livrés » tant qu’aucun n’est daté", async () => {
      const groupes = [...el(await monter()).querySelectorAll(".groupe")].map(
        (g) => g.firstChild?.textContent?.trim(),
      );

      expect(groupes).toEqual(["En cours", "Livrés"]);
    });

    it("dit une fois, avec sa cause, que les dates n’ont pas pu être lues", async () => {
      const f = await monter();
      await refuserDates();
      await flushPromises();

      const notes = el(f).querySelectorAll(".note-dates");
      expect(notes.length).toBe(1);
      expect(notes[0].textContent).toContain("n’ont pas pu être lues");
      // sans jeton, la cause probable est la limite des requêtes anonymes
      expect(notes[0].textContent).toContain("Se connecter");
    });
  });

  describe("un filtre", () => {
    it("réduit la liste à un mot du titre, dans le même ordre", async () => {
      const f = await monter();
      await taper(f, "diagrammes");

      expect(lignes(f)).toEqual(["2026-004"]);
      expect(el(f).querySelector(".compte")?.textContent).toContain(
        "1 cadrage sur 3",
      );
    });

    it("retient les cadrages des domaines choisis, en cours compris", async () => {
      const f = await monter();
      domaine(f, "Référentiel").click();
      await nextTick();

      expect(lignes(f)).toEqual(["2026-005", "2026-004"]);
      expect(domaine(f, "Référentiel").getAttribute("aria-pressed")).toBe(
        "true",
      );
    });

    it("dit quand il ne retient rien, et s’efface", async () => {
      const f = await monter();
      await taper(f, "introuvable");

      const vide = el(f).querySelector(".vide");
      expect(vide?.textContent).toContain("Aucun cadrage ne correspond");
      vide!.querySelector("button")!.click();
      await nextTick();

      expect(lignes(f).length).toBe(3);
      expect(
        el(f).querySelector<HTMLInputElement>(".filtre input")!.value,
      ).toBe("");
    });

    it("se conserve au retour d’une fiche", async () => {
      const premier = await monter();
      await taper(premier, "pièces");
      premier.unmount();

      const retour = await monter();
      expect(lignes(retour)).toEqual(["2026-003"]);
      expect(
        el(retour).querySelector<HTMLInputElement>(".filtre input")!.value,
      ).toBe("pièces");
    });

    it("ne suit pas le lecteur dans un autre projet", async () => {
      const premier = await monter();
      await taper(premier, "pièces");
      premier.unmount();

      inject(RepoConfig).saveDepot({ owner: "org", repo: "autre" });
      expect(lignes(await monter()).length).toBe(3);
    });
  });
});
