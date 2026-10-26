import { flushPromises, mount } from "@vue/test-utils";
import { beforeEach, describe, expect, it } from "vitest";
import { createMemoryHistory } from "vue-router";
import {
  provideHttpTesting,
  settle,
  type HttpTestingController,
} from "../../core/http/http-testing";
import { inject } from "../../core/injection";
import { ReferentielStore } from "../../core/repo/referentiel.store";
import { createRouteur } from "../../routeur";
import ReglePage, { listVoisines } from "./ReglePage.vue";

/**
 * Une règle située — RG-regle-situee.
 *
 * Une règle s'atteint souvent sans passer par l'arborescence : par la recherche, par un impact. Ce qui est éprouvé ici, c'est que sa fiche dit alors de quoi elle fait partie, et ce qui l'entoure.
 */

function regle(id: string, fonctionnalites: string): string {
  return `---
id: ${id}
fonctionnalites: [${fonctionnalites}]
statut: actif
cree_par: null
modifie_par: []
---

Énoncé de ${id}.
`;
}

const FICHIERS: Record<string, string> = {
  "domains/facturation.md":
    "---\nid: facturation\nnom: Facturation\n---\n\nLes factures.\n",
  "domains/clients.md": "---\nid: clients\nnom: Clients\n---\n\nLes clients.\n",
  "features/relance.md":
    "---\nid: relance\nnom: Relance des impayés\ndomaines: [facturation]\n---\n\nRelances.\n",
  "features/litiges.md":
    "---\nid: litiges\nnom: Litiges\ndomaines: [facturation, clients]\n---\n\nLitiges.\n",
  "rules/RG-delai.md": regle("RG-delai", "relance"),
  "rules/RG-limite.md": regle("RG-limite", "relance, litiges"),
  "rules/RG-mediation.md": regle("RG-mediation", "litiges"),
};

let http: HttpTestingController;

async function charger(): Promise<void> {
  const p = inject(ReferentielStore).loadReferentiel({
    owner: "test",
    repo: "test",
  });
  await settle();
  http
    .expectOne((r) => r.url.includes("/git/trees/"))
    .flush({
      sha: "racine",
      truncated: false,
      tree: Object.keys(FICHIERS).map((path, i) => ({
        path,
        sha: `s${i}`,
        type: "blob",
      })),
    });
  const restants = new Set(Object.keys(FICHIERS));
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

async function monter(id: string): Promise<HTMLElement> {
  await charger();
  const routeur = createRouteur(createMemoryHistory());
  await routeur.push(`/test/test/referentiel/regle/${id}`);
  await routeur.isReady();
  const vue = mount(ReglePage, { global: { plugins: [routeur] } });
  await flushPromises();
  return vue.element as HTMLElement;
}

function liens(el: Element | null): string[] {
  return [...(el?.querySelectorAll("a") ?? [])].map(
    (a) => a.textContent?.trim() ?? "",
  );
}

describe("Une règle située", () => {
  beforeEach(() => {
    http = provideHttpTesting();
  });

  it("dit dans quel domaine et quelle fonctionnalité elle se range", async () => {
    const el = await monter("RG-delai");

    const fil = el.querySelector('nav[aria-label="Fil d’Ariane"]');
    expect(liens(fil)).toEqual([
      "Fonctionnel",
      "Facturation",
      "Relance des impayés",
    ]);
  });

  it("nomme toutes ses fonctionnalités, et chaque domaine une fois", async () => {
    const el = await monter("RG-limite");

    const fil = el.querySelector('nav[aria-label="Fil d’Ariane"]');
    // Facturation porte les deux fonctionnalités : elle n'est pas répétée
    expect(liens(fil)).toEqual([
      "Fonctionnel",
      "Clients",
      "Facturation",
      "Relance des impayés",
      "Litiges",
    ]);
  });

  it("porte la couleur du domaine à côté de son nom", async () => {
    const el = await monter("RG-delai");

    const domaine = el.querySelector('nav[aria-label="Fil d’Ariane"] .domaine');
    expect(domaine?.textContent).toContain("Facturation");
    expect(
      (domaine as HTMLElement).style.getPropertyValue("--pc-domaine"),
    ).not.toBe("");
  });

  it("propose les autres règles de chacune de ses fonctionnalités", async () => {
    const el = await monter("RG-limite");

    const blocs = [...el.querySelectorAll(".voisines section")];
    expect(
      blocs.map((b) => b.querySelector("h2")?.textContent?.trim()),
    ).toEqual(["Dans Relance des impayés", "Dans Litiges"]);
    expect(liens(blocs[0])).toEqual(["RG-delai"]);
    expect(liens(blocs[1])).toEqual(["RG-mediation"]);
    // la règle courante figure à sa place, sans être un lien vers elle-même
    const courante = blocs[0].querySelector('[aria-current="page"]');
    expect(courante?.textContent?.trim()).toBe("RG-limite");
  });

  it("ne garde plus le seul retour vers le référentiel", async () => {
    const el = await monter("RG-delai");

    expect(el.querySelector(".retour")).toBeNull();
  });
});

describe("Les voisines d’une règle", () => {
  const ids = Array.from(
    { length: 20 },
    (_, i) => `RG-${String(i).padStart(2, "0")}`,
  );

  it("les garde toutes quand elles tiennent", () => {
    expect(listVoisines(["RG-a", "RG-b", "RG-c"], "RG-b", 8)).toEqual([
      "RG-a",
      "RG-b",
      "RG-c",
    ]);
  });

  it("garde une fenêtre autour de la règle courante quand elles sont trop nombreuses", () => {
    const fenetre = listVoisines(ids, "RG-10", 8);

    expect(fenetre.length).toBe(8);
    expect(fenetre).toContain("RG-10");
    expect(fenetre[0]).toBe("RG-07");
  });

  it("se cale sur le début ou la fin de la liste", () => {
    expect(listVoisines(ids, "RG-00", 8)[0]).toBe("RG-00");
    expect(listVoisines(ids, "RG-19", 8).at(-1)).toBe("RG-19");
    expect(listVoisines(ids, "RG-19", 8).length).toBe(8);
  });
});
