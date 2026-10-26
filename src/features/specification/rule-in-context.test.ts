import { flushPromises, mount } from "@vue/test-utils";
import { beforeEach, describe, expect, it } from "vitest";
import { createMemoryHistory } from "vue-router";
import {
  provideHttpTesting,
  settle,
  type HttpTestingController,
} from "../../core/http/http-testing";
import { inject } from "../../core/injection";
import { SpecificationStore } from "../../core/repo/specification.store";
import { createAppRouter } from "../../router";
import RulePage, { listNeighbors } from "./RulePage.vue";

/**
 * Une règle située — RG-regle-situee.
 *
 * Une règle s'atteint souvent sans passer par l'arborescence : par la recherche, par un impact. Ce qui est éprouvé ici, c'est que sa fiche dit alors de quoi elle fait partie, et ce qui l'entoure.
 */

function rule(id: string, features: string): string {
  return `---
id: ${id}
fonctionnalites: [${features}]
statut: actif
cree_par: null
modifie_par: []
---

Énoncé de ${id}.
`;
}

const FILES: Record<string, string> = {
  "domains/facturation.md":
    "---\nid: facturation\nnom: Facturation\n---\n\nLes factures.\n",
  "domains/clients.md": "---\nid: clients\nnom: Clients\n---\n\nLes clients.\n",
  "features/relance.md":
    "---\nid: relance\nnom: Relance des impayés\ndomaines: [facturation]\n---\n\nRelances.\n",
  "features/litiges.md":
    "---\nid: litiges\nnom: Litiges\ndomaines: [facturation, clients]\n---\n\nLitiges.\n",
  "rules/RG-delai.md": rule("RG-delai", "relance"),
  "rules/RG-limite.md": rule("RG-limite", "relance, litiges"),
  "rules/RG-mediation.md": rule("RG-mediation", "litiges"),
};

let http: HttpTestingController;

async function load(): Promise<void> {
  const p = inject(SpecificationStore).loadSpecification({
    owner: "test",
    repo: "test",
  });
  await settle();
  http
    .expectOne((r) => r.url.includes("/git/trees/"))
    .flush({
      sha: "racine",
      truncated: false,
      tree: Object.keys(FILES).map((path, i) => ({
        path,
        sha: `s${i}`,
        type: "blob",
      })),
    });
  const remaining = new Set(Object.keys(FILES));
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

async function mountView(id: string): Promise<HTMLElement> {
  await load();
  const router = createAppRouter(createMemoryHistory());
  await router.push(`/test/test/referentiel/regle/${id}`);
  await router.isReady();
  const view = mount(RulePage, { global: { plugins: [router] } });
  await flushPromises();
  return view.element as HTMLElement;
}

function links(el: Element | null): string[] {
  return [...(el?.querySelectorAll("a") ?? [])].map(
    (a) => a.textContent?.trim() ?? "",
  );
}

describe("Une règle située", () => {
  beforeEach(() => {
    http = provideHttpTesting();
  });

  it("dit dans quel domaine et quelle fonctionnalité elle se range", async () => {
    const el = await mountView("RG-delai");

    const thread = el.querySelector('nav[aria-label="Fil d’Ariane"]');
    expect(links(thread)).toEqual([
      "Fonctionnel",
      "Facturation",
      "Relance des impayés",
    ]);
  });

  it("nomme toutes ses fonctionnalités, et chaque domaine une fois", async () => {
    const el = await mountView("RG-limite");

    const thread = el.querySelector('nav[aria-label="Fil d’Ariane"]');
    // Facturation porte les deux fonctionnalités : elle n'est pas répétée
    expect(links(thread)).toEqual([
      "Fonctionnel",
      "Clients",
      "Facturation",
      "Relance des impayés",
      "Litiges",
    ]);
  });

  it("porte la couleur du domaine à côté de son nom", async () => {
    const el = await mountView("RG-delai");

    const domain = el.querySelector('nav[aria-label="Fil d’Ariane"] .domaine');
    expect(domain?.textContent).toContain("Facturation");
    expect(
      (domain as HTMLElement).style.getPropertyValue("--pc-domaine"),
    ).not.toBe("");
  });

  it("propose les autres règles de chacune de ses fonctionnalités", async () => {
    const el = await mountView("RG-limite");

    const blocks = [...el.querySelectorAll(".voisines section")];
    expect(
      blocks.map((b) => b.querySelector("h2")?.textContent?.trim()),
    ).toEqual(["Dans Relance des impayés", "Dans Litiges"]);
    expect(links(blocks[0])).toEqual(["RG-delai"]);
    expect(links(blocks[1])).toEqual(["RG-mediation"]);
    // la règle courante figure à sa place, sans être un lien vers elle-même
    const current = blocks[0].querySelector('[aria-current="page"]');
    expect(current?.textContent?.trim()).toBe("RG-limite");
  });

  it("ne garde plus le seul retour vers le référentiel", async () => {
    const el = await mountView("RG-delai");

    expect(el.querySelector(".retour")).toBeNull();
  });
});

describe("Les voisines d’une règle", () => {
  const ids = Array.from(
    { length: 20 },
    (_, i) => `RG-${String(i).padStart(2, "0")}`,
  );

  it("les garde toutes quand elles tiennent", () => {
    expect(listNeighbors(["RG-a", "RG-b", "RG-c"], "RG-b", 8)).toEqual([
      "RG-a",
      "RG-b",
      "RG-c",
    ]);
  });

  it("garde une fenêtre autour de la règle courante quand elles sont trop nombreuses", () => {
    const window = listNeighbors(ids, "RG-10", 8);

    expect(window.length).toBe(8);
    expect(window).toContain("RG-10");
    expect(window[0]).toBe("RG-07");
  });

  it("se cale sur le début ou la fin de la liste", () => {
    expect(listNeighbors(ids, "RG-00", 8)[0]).toBe("RG-00");
    expect(listNeighbors(ids, "RG-19", 8).at(-1)).toBe("RG-19");
    expect(listNeighbors(ids, "RG-19", 8).length).toBe(8);
  });
});
