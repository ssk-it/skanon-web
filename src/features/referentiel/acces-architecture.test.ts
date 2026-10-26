import { flushPromises, mount, type VueWrapper } from "@vue/test-utils";
import { beforeEach, describe, expect, it } from "vitest";
import { createMemoryHistory } from "vue-router";
import App from "../../App.vue";
import {
  provideHttpTesting,
  settle,
  type HttpTestingController,
} from "../../core/http/http-testing";
import { inject } from "../../core/injection";
import { ReferentielStore } from "../../core/repo/referentiel.store";
import { createRouteur } from "../../routeur";
import ArchitecturePage from "./ArchitecturePage.vue";
import ReferentielPage from "./ReferentielPage.vue";

/**
 * L'accès au référentiel technique — RG-architecture-au-premier-niveau et RG-vue-vide-dit-ce-qui-manque.
 *
 * Ce qui est éprouvé ici n'est pas que la page sait s'afficher : elle le savait déjà. C'est qu'on y arrive sans la chercher, et que le projet qui ne décrit rien l'apprend au lieu de voir des listes vides.
 */

/** Un dépôt sans le moindre document d'architecture — le cas majoritaire. */
const ARBRE_SANS_ARCHITECTURE = {
  sha: "racine",
  truncated: false,
  tree: [{ path: "domains/facturation.md", sha: "d1", type: "blob" }],
};

/** Le même, décrivant un composant et un flux qui le touche. */
const ARBRE_AVEC_ARCHITECTURE = {
  sha: "racine",
  truncated: false,
  tree: [
    { path: "domains/facturation.md", sha: "d1", type: "blob" },
    { path: "architecture/CMP-api.md", sha: "a1", type: "blob" },
    { path: "architecture/FLX-export-nocturne.md", sha: "a2", type: "blob" },
  ],
};

const FICHIERS: Record<string, string> = {
  "domains/facturation.md": `---
id: facturation
nom: Facturation
---

Émission et suivi des factures.
`,
  "architecture/CMP-api.md": `---
id: CMP-api
nature: composant
statut: actif
cree_par: null
modifie_par: []
---

L'API métier.
`,
  "architecture/FLX-export-nocturne.md": `---
id: FLX-export-nocturne
nature: flux
composants: [CMP-api]
statut: actif
cree_par: null
modifie_par: []
---

Export déposé chaque nuit.
`,
};

interface Arbre {
  sha: string;
  truncated: boolean;
  tree: { path: string; sha: string; type: string }[];
}

let http: HttpTestingController;

async function charger(arbre: Arbre): Promise<void> {
  const store = inject(ReferentielStore);
  const p = store.loadReferentiel({ owner: "test", repo: "test" });
  await settle();

  http.expectOne((r) => r.url.includes("/git/trees/")).flush(arbre);

  const restants = new Set(arbre.tree.map((e) => e.path));
  for (let tour = 0; tour < 50 && restants.size; tour++) {
    await Promise.resolve();
    for (const chemin of [...restants]) {
      const enVol = http.match((r) => r.url.endsWith(chemin));
      if (enVol.length) {
        enVol[0].flush(FICHIERS[chemin]);
        restants.delete(chemin);
      }
    }
  }
  expect([...restants]).toEqual([]);
  await p;
}

async function routeurSur(adresse: string) {
  const routeur = createRouteur(createMemoryHistory());
  await routeur.push(adresse);
  await routeur.isReady();
  return routeur;
}

/** La coquille entière : sa racine est un fragment, d'où une lecture par l'enveloppe plutôt que par l'élément. */
async function monterApp(adresse: string): Promise<VueWrapper> {
  const routeur = await routeurSur(adresse);
  const vue = mount(App, { global: { plugins: [routeur] } });
  await flushPromises();
  return vue;
}

async function monterPage(
  page: typeof ArchitecturePage | typeof ReferentielPage,
): Promise<HTMLElement> {
  const routeur = await routeurSur("/test/test/referentiel");
  const vue = mount(page, { global: { plugins: [routeur] } });
  await flushPromises();
  return vue.element as HTMLElement;
}

function onglets(app: VueWrapper): string[] {
  return app.findAll(".onglets a").map((a) => a.text().trim());
}

describe("Accès à l’architecture depuis la barre", () => {
  beforeEach(() => {
    http = provideHttpTesting();
  });

  it("propose l’architecture au même rang que le fonctionnel", async () => {
    const app = await monterApp("/test/test/referentiel");

    expect(onglets(app)).toEqual([
      "Fonctionnel",
      "Architecture",
      "Cadrages",
      "Évolution",
    ]);
  });

  it("propose l’architecture même quand le projet n’en décrit aucune", async () => {
    await charger(ARBRE_SANS_ARCHITECTURE);
    const app = await monterApp("/test/test/referentiel");

    // L'entrée ne dépend pas du contenu : celui qui n'a rien décrit est précisément celui à qui la possibilité doit être montrée.
    expect(onglets(app)).toContain("Architecture");
  });

  it("ne propose aucune vue hors d’un projet", async () => {
    const app = await monterApp("/");

    expect(app.find(".onglets").exists()).toBe(false);
  });

  it("ne garde pas de carte d’accès sur la page fonctionnelle", async () => {
    await charger(ARBRE_AVEC_ARCHITECTURE);
    const el = await monterPage(ReferentielPage);

    // L'accès est dans la barre : le redoubler ici entretiendrait l'idée que l'architecture s'atteint en traversant le fonctionnel.
    expect(el.querySelector(".vers-architecture")).toBeNull();
  });
});

describe("Architecture sans contenu", () => {
  beforeEach(() => {
    http = provideHttpTesting();
  });

  it("dit ce que la vue accueillerait, au lieu de lister du vide", async () => {
    await charger(ARBRE_SANS_ARCHITECTURE);
    const el = await monterPage(ArchitecturePage);
    const texte = el.textContent ?? "";

    expect(el.querySelector(".vide-instruit")).not.toBeNull();
    expect(texte).toContain("ne décrit pas encore son architecture");
    // les quatre natures sont nommées : le lecteur apprend ce qu'il pourrait écrire
    for (const nature of ["Composants", "Flux", "Contexte", "Décisions"]) {
      expect(texte).toContain(nature);
    }
    // et par où commencer, le référentiel ne s'éditant pas directement
    expect(texte).toContain("cadrage");
    // aucune liste vide ne subsiste à côté de l'explication
    expect(el.querySelectorAll(".liste").length).toBe(0);
  });

  it("s’efface dès que le projet décrit quelque chose", async () => {
    await charger(ARBRE_AVEC_ARCHITECTURE);
    const el = await monterPage(ArchitecturePage);

    expect(el.querySelector(".vide-instruit")).toBeNull();
    expect(el.textContent).toContain("CMP-api");
    expect(el.textContent).toContain("FLX-export-nocturne");
  });
});
