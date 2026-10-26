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
import { SpecificationStore } from "../../core/repo/specification.store";
import { createAppRouter } from "../../router";
import ArchitecturePage from "./ArchitecturePage.vue";
import SpecificationPage from "./SpecificationPage.vue";

/**
 * L'accès au référentiel technique — RG-architecture-au-premier-niveau et RG-vue-vide-dit-ce-qui-manque.
 *
 * Ce qui est éprouvé ici n'est pas que la page sait s'afficher : elle le savait déjà. C'est qu'on y arrive sans la chercher, et que le projet qui ne décrit rien l'apprend au lieu de voir des listes vides.
 */

/** Un dépôt sans le moindre document d'architecture — le cas majoritaire. */
const TREE_WITHOUT_ARCHITECTURE = {
  sha: "racine",
  truncated: false,
  tree: [{ path: "domains/facturation.md", sha: "d1", type: "blob" }],
};

/** Le même, décrivant un composant et un flux qui le touche. */
const TREE_WITH_ARCHITECTURE = {
  sha: "racine",
  truncated: false,
  tree: [
    { path: "domains/facturation.md", sha: "d1", type: "blob" },
    { path: "architecture/CMP-api.md", sha: "a1", type: "blob" },
    { path: "architecture/FLX-export-nocturne.md", sha: "a2", type: "blob" },
  ],
};

const FILES: Record<string, string> = {
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

interface Tree {
  sha: string;
  truncated: boolean;
  tree: { path: string; sha: string; type: string }[];
}

let http: HttpTestingController;

async function load(tree: Tree): Promise<void> {
  const store = inject(SpecificationStore);
  const p = store.loadSpecification({ owner: "test", repo: "test" });
  await settle();

  http.expectOne((r) => r.url.includes("/git/trees/")).flush(tree);

  const remaining = new Set(tree.tree.map((e) => e.path));
  for (let round = 0; round < 50 && remaining.size; round++) {
    await Promise.resolve();
    for (const path of [...remaining]) {
      const inFlight = http.match((r) => r.url.endsWith(path));
      if (inFlight.length) {
        inFlight[0].flush(FILES[path]);
        remaining.delete(path);
      }
    }
  }
  expect([...remaining]).toEqual([]);
  await p;
}

async function routerAt(address: string) {
  const router = createAppRouter(createMemoryHistory());
  await router.push(address);
  await router.isReady();
  return router;
}

/** La coquille entière : sa racine est un fragment, d'où une lecture par l'enveloppe plutôt que par l'élément. */
async function mountApp(address: string): Promise<VueWrapper> {
  const router = await routerAt(address);
  const view = mount(App, { global: { plugins: [router] } });
  await flushPromises();
  return view;
}

async function mountPage(
  page: typeof ArchitecturePage | typeof SpecificationPage,
): Promise<HTMLElement> {
  const router = await routerAt("/test/test/referentiel");
  const view = mount(page, { global: { plugins: [router] } });
  await flushPromises();
  return view.element as HTMLElement;
}

function tabs(app: VueWrapper): string[] {
  return app.findAll(".onglets a").map((a) => a.text().trim());
}

describe("Accès à l’architecture depuis la barre", () => {
  beforeEach(() => {
    http = provideHttpTesting();
  });

  it("propose l’architecture au même rang que le fonctionnel", async () => {
    const app = await mountApp("/test/test/referentiel");

    expect(tabs(app)).toEqual([
      "Fonctionnel",
      "Architecture",
      "Cadrages",
      "Évolution",
    ]);
  });

  it("propose l’architecture même quand le projet n’en décrit aucune", async () => {
    await load(TREE_WITHOUT_ARCHITECTURE);
    const app = await mountApp("/test/test/referentiel");

    // L'entrée ne dépend pas du contenu : celui qui n'a rien décrit est précisément celui à qui la possibilité doit être montrée.
    expect(tabs(app)).toContain("Architecture");
  });

  it("ne propose aucune vue hors d’un projet", async () => {
    const app = await mountApp("/");

    expect(app.find(".onglets").exists()).toBe(false);
  });

  it("ne garde pas de carte d’accès sur la page fonctionnelle", async () => {
    await load(TREE_WITH_ARCHITECTURE);
    const el = await mountPage(SpecificationPage);

    // L'accès est dans la barre : le redoubler ici entretiendrait l'idée que l'architecture s'atteint en traversant le fonctionnel.
    expect(el.querySelector(".vers-architecture")).toBeNull();
  });
});

describe("Architecture sans contenu", () => {
  beforeEach(() => {
    http = provideHttpTesting();
  });

  it("dit ce que la vue accueillerait, au lieu de lister du vide", async () => {
    await load(TREE_WITHOUT_ARCHITECTURE);
    const el = await mountPage(ArchitecturePage);
    const text = el.textContent ?? "";

    expect(el.querySelector(".vide-instruit")).not.toBeNull();
    expect(text).toContain("ne décrit pas encore son architecture");
    // les quatre natures sont nommées : le lecteur apprend ce qu'il pourrait écrire
    for (const kind of ["Composants", "Flux", "Contexte", "Décisions"]) {
      expect(text).toContain(kind);
    }
    // et par où commencer, le référentiel ne s'éditant pas directement
    expect(text).toContain("cadrage");
    // aucune liste vide ne subsiste à côté de l'explication
    expect(el.querySelectorAll(".liste").length).toBe(0);
  });

  it("s’efface dès que le projet décrit quelque chose", async () => {
    await load(TREE_WITH_ARCHITECTURE);
    const el = await mountPage(ArchitecturePage);

    expect(el.querySelector(".vide-instruit")).toBeNull();
    expect(el.textContent).toContain("CMP-api");
    expect(el.textContent).toContain("FLX-export-nocturne");
  });
});
