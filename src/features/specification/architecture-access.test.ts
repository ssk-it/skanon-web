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
 * Access to the technical specification — RG-architecture-au-premier-niveau and RG-vue-vide-dit-ce-qui-manque.
 *
 * What is tested here is not that the page can display itself: it already could. It is that one gets there without looking for it, and that the project that describes nothing learns so instead of seeing empty lists.
 */

/** A repo without a single architecture document — the majority case. */
const TREE_WITHOUT_ARCHITECTURE = {
  sha: "racine",
  truncated: false,
  tree: [{ path: "domains/facturation.md", sha: "d1", type: "blob" }],
};

/** The same, describing a component and a flow that touches it. */
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

/** The whole shell: its root is a fragment, hence reading through the wrapper rather than through the element. */
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

describe("Access to architecture from the top bar", () => {
  beforeEach(() => {
    http = provideHttpTesting();
  });

  it("offers architecture at the same rank as the functional part", async () => {
    const app = await mountApp("/test/test/referentiel");

    expect(tabs(app)).toEqual([
      "Fonctionnel",
      "Architecture",
      "Cadrages",
      "Évolution",
    ]);
  });

  it("offers architecture even when the project describes none", async () => {
    await load(TREE_WITHOUT_ARCHITECTURE);
    const app = await mountApp("/test/test/referentiel");

    // The entry does not depend on the content: whoever has described nothing is precisely the one to whom the possibility must be shown.
    expect(tabs(app)).toContain("Architecture");
  });

  it("offers no view outside a project", async () => {
    const app = await mountApp("/");

    expect(app.find(".onglets").exists()).toBe(false);
  });

  it("keeps no access card on the functional page", async () => {
    await load(TREE_WITH_ARCHITECTURE);
    const el = await mountPage(SpecificationPage);

    // Access is in the top bar: duplicating it here would sustain the idea that architecture is reached by going through the functional part.
    expect(el.querySelector(".vers-architecture")).toBeNull();
  });
});

describe("Architecture without content", () => {
  beforeEach(() => {
    http = provideHttpTesting();
  });

  it("says what the view would hold, instead of listing emptiness", async () => {
    await load(TREE_WITHOUT_ARCHITECTURE);
    const el = await mountPage(ArchitecturePage);
    const text = el.textContent ?? "";

    expect(el.querySelector(".vide-instruit")).not.toBeNull();
    expect(text).toContain("ne décrit pas encore son architecture");
    // the four kinds are named: the reader learns what they could write
    for (const kind of ["Composants", "Flux", "Contexte", "Décisions"]) {
      expect(text).toContain(kind);
    }
    // and where to start, the specification not being edited directly
    expect(text).toContain("cadrage");
    // no empty list remains next to the explanation
    expect(el.querySelectorAll(".liste").length).toBe(0);
  });

  it("clears as soon as the project describes something", async () => {
    await load(TREE_WITH_ARCHITECTURE);
    const el = await mountPage(ArchitecturePage);

    expect(el.querySelector(".vide-instruit")).toBeNull();
    expect(el.textContent).toContain("CMP-api");
    expect(el.textContent).toContain("FLX-export-nocturne");
  });
});
