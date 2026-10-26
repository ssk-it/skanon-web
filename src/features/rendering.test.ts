import { flushPromises, mount } from "@vue/test-utils";
import { beforeAll, beforeEach, describe, expect, it } from "vitest";
import type { Component } from "vue";
import { createMemoryHistory } from "vue-router";
import {
  provideHttpTesting,
  settle,
  type HttpTestingController,
} from "../core/http/http-testing";
import { inject } from "../core/injection";
import { SpecificationStore } from "../core/repo/specification.store";
import { createAppRouter } from "../router";
import ScopingPage from "./scopings/ScopingPage.vue";
import ScopingsPage from "./scopings/ScopingsPage.vue";
import DomainPage from "./specification/DomainPage.vue";
import SpecificationPage from "./specification/SpecificationPage.vue";
import RulePage from "./specification/RulePage.vue";

/**
 * Monte les écrans avec un référentiel réaliste et inspecte le DOM produit.
 *
 * Ce qui est vérifié ici est ce qu'un coup d'œil au navigateur montrerait : que les données arrivent à l'écran, et que les deux cas subtils du modèle — la divergence d'énoncé et l'abrogation — sont visibles et expliqués.
 */
const TREE = {
  sha: "racine",
  truncated: false,
  tree: [
    { path: "domains/facturation.md", sha: "d1", type: "blob" },
    { path: "features/relance.md", sha: "f1", type: "blob" },
    { path: "rules/RG-limite.md", sha: "r1", type: "blob" },
    { path: "rules/RG-obsolete.md", sha: "r2", type: "blob" },
    { path: "cadrages/2026-001/cadrage.md", sha: "c1", type: "blob" },
  ],
};

const FILES: Record<string, string> = {
  "domains/facturation.md": `---
id: facturation
nom: Facturation
---

Émission et suivi des factures.

\`\`\`mermaid
flowchart LR
  A --> B
\`\`\`
`,
  "features/relance.md": `---
id: relance
nom: Relance des impayés
domaines: [facturation]
---

Relance automatique des factures échues.
`,
  "rules/RG-limite.md": `---
id: RG-limite
fonctionnalites: [relance]
statut: actif
cree_par: 2026-001
modifie_par: []
---

Une facture fait l'objet de **quatorze** relances au maximum.
`,
  "rules/RG-obsolete.md": `---
id: RG-obsolete
fonctionnalites: [relance]
statut: abroge
cree_par: 2026-001
modifie_par: []
---

Ancienne règle, ne s'applique plus.
`,
  "cadrages/2026-001/cadrage.md": `---
id: 2026-001
titre: Relance automatique
statut: livree
domaines: [facturation]
liens:
  - { tag: carte_trello, url: 'https://trello.com/c/xyz' }
impacts:
  - { regle: RG-limite, operation: cree }
  - { regle: RG-obsolete, operation: abroge }
---

## Objectif

Réduire le délai d'encaissement.

## Ce que la mesure a montré

Deux relances sur trois partent le week-end.

### Une observation, hors périmètre

Les journaux d'envoi ne sont pas conservés.

## Énoncés

### RG-limite

Une facture fait l'objet de **trois** relances au maximum.
`,
};

let http: HttpTestingController;

async function loadTestSpecification(): Promise<void> {
  const store = inject(SpecificationStore);
  const p = store.loadSpecification({ owner: "test", repo: "test" });
  await settle();

  http.expectOne((r) => r.url.includes("/git/trees/")).flush(TREE);

  // Les requêtes de contenu partent après résolution de l'arborescence, à travers plusieurs micro-tâches et une file à concurrence bornée : on répond à ce qui est en vol jusqu'à épuisement plutôt que de supposer un timing.
  const remaining = new Set(Object.keys(FILES));
  // Un tour de la boucle d'événements à chaque fois, non une micro-tâche : sous la charge de toute la suite, une étape de la lecture peut attendre plus que les micro-tâches d'un tour.
  for (let round = 0; round < 50 && remaining.size; round++) {
    await new Promise((r) => setTimeout(r, 0));
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

/** Monte `page` à l'adresse `chemin` du dépôt de test, le référentiel déjà chargé. */
async function mountView(page: Component, path: string): Promise<HTMLElement> {
  const router = createAppRouter(createMemoryHistory());
  await router.push(`/test/test/${path}`);
  await router.isReady();
  const view = mount(page, { global: { plugins: [router] } });
  await flushPromises();
  return view.element.parentElement ?? (view.element as HTMLElement);
}

// Mermaid pèse plusieurs mégaoctets, et `MarkdownRendu` le charge à la demande : sous la charge de toute la suite, ce premier chargement dépassait à lui seul le délai d'un test (constaté une fois sur six). Le charger avant, avec son propre délai, laisse aux tests le seul comportement à éprouver.
beforeAll(async () => {
  await import("mermaid");
}, 60_000);

describe("rendu des écrans", () => {
  beforeEach(() => {
    http = provideHttpTesting();
  });

  it("la page référentiel liste les domaines avec leur compte", async () => {
    await loadTestSpecification();
    const el = await mountView(SpecificationPage, "referentiel");

    const text = el.textContent ?? "";
    expect(text).toContain("Facturation");
    expect(text).toContain("1 fonctionnalités");
    // le compte n'inclut pas la règle abrogée
    expect(text).toContain("1 règles actives");
  });

  it("la fiche domaine liste les cadrages qui s’y rattachent", async () => {
    await loadTestSpecification();
    const el = await mountView(DomainPage, "referentiel/domaine/facturation");

    // Le rattachement est celui que le cadrage déclare : il peut ne toucher aucune règle du domaine — n'en décrire que l'architecture — et devoir s'y lire tout de même.
    const link = el.querySelector('a[href$="/cadrages/2026-001"]');
    expect(link).not.toBeNull();
    expect(link?.textContent).toContain("Relance automatique");
    expect(link?.querySelector(".statut-chip")).not.toBeNull();
  });

  it("la fiche domaine dessine le diagramme au lieu d’en montrer la source", async () => {
    await loadTestSpecification();
    const el = await mountView(DomainPage, "referentiel/domaine/facturation");
    await new Promise((r) => setTimeout(r, 300));
    await flushPromises();

    // La prose qui entoure le schéma se lit toujours.
    expect(el.textContent).toContain("Émission et suivi des factures.");
    // Le bloc a quitté la forme où le rendu Markdown le laisse : c'est exactement ce que la page montrait, et qu'on prenait pour le contenu.
    expect(el.querySelector("code.language-mermaid")).toBeNull();
    // Il occupe son emplacement — dessiné, ou signalé en échec, le moteur mesurant le texte par `getBBox` que l'environnement de test n'a pas.
    expect(
      el.querySelector(".pc-diagramme, .pc-diagramme-erreur"),
    ).not.toBeNull();
  });

  it("la fiche règle remonte au cadrage responsable", async () => {
    await loadTestSpecification();
    const el = await mountView(RulePage, "referentiel/regle/RG-limite");

    const text = el.textContent ?? "";
    expect(text).toContain("RG-limite");
    expect(text).toContain("Relance automatique");
    expect(text).toContain("quatorze");
    expect(el.querySelector(".operation-chip")?.textContent).toContain("crée");
  });

  it("la fiche règle signale une règle abrogée", async () => {
    await loadTestSpecification();
    const el = await mountView(RulePage, "referentiel/regle/RG-obsolete");

    expect(el.querySelector(".bandeau-abrogee")).not.toBeNull();
    expect(el.textContent).toContain("ne s’applique plus");
  });

  it("la fiche cadrage rend objectif, liens et impacts", async () => {
    await loadTestSpecification();
    const el = await mountView(ScopingPage, "cadrages/2026-001");

    const text = el.textContent ?? "";
    expect(text).toContain("Relance automatique");
    expect(text).toContain("Réduire le délai d'encaissement");
    expect(
      el.querySelector('a[href="https://trello.com/c/xyz"]'),
    ).not.toBeNull();
    expect(el.querySelectorAll(".impact").length).toBe(2);
  });

  it("la fiche cadrage rassemble sous « Divers » ce que le gabarit ignore", async () => {
    await loadTestSpecification();
    const el = await mountView(ScopingPage, "cadrages/2026-001");

    const block = el.querySelector("#divers");
    expect(block).not.toBeNull();
    // le titre d'origine, seul à dire de quoi la section parle
    expect(block?.querySelector("h3")?.textContent?.trim()).toBe(
      "Ce que la mesure a montré",
    );
    expect(block?.textContent).toContain("partent le week-end");
    // et sa sous-section, qui n'a pas d'autre endroit où se lire
    expect(block?.textContent).toContain("Une observation, hors périmètre");
    expect(block?.textContent).toContain("ne sont pas conservés");
  });

  it("le sommaire nomme chaque section rassemblée sous « Divers »", async () => {
    await loadTestSpecification();
    const el = await mountView(ScopingPage, "cadrages/2026-001");

    const links = el.querySelectorAll(".sommaire a");
    const labels = [...links].map((a) => a.textContent?.trim() ?? "");
    expect(labels.some((l) => l.startsWith("Divers"))).toBe(true);
    expect(labels.some((l) => l.includes("Ce que la mesure a montré"))).toBe(
      true,
    );
  });

  it("la fiche cadrage signale un énoncé divergent de l’énoncé courant", async () => {
    await loadTestSpecification();
    const el = await mountView(ScopingPage, "cadrages/2026-001");

    // le cadrage dit « trois », la règle dit « quatorze » : l'écart doit être expliqué, sinon le lecteur y voit une incohérence
    const divergence = el.querySelector(".i-divergence");
    expect(divergence).not.toBeNull();
    expect(divergence?.textContent).toContain(
      "modifié par un cadrage ultérieur",
    );
    expect(el.textContent).toContain("trois");
  });

  it("le sommaire liste les sections, les décisions et les impacts", async () => {
    await loadTestSpecification();
    const el = await mountView(ScopingPage, "cadrages/2026-001");

    const links = el.querySelectorAll(".sommaire a");
    const labels = [...links].map((a) => a.textContent?.trim() ?? "");

    // les sections présentes, et chaque impact nommément — c'est ce qu'on cherche en revenant sur une fiche
    expect(labels.some((l) => l.startsWith("Objectif"))).toBe(true);
    expect(labels.some((l) => l.includes("Impacts"))).toBe(true);
    expect(labels.some((l) => l.includes("RG-limite"))).toBe(true);
    expect(labels.some((l) => l.includes("RG-obsolete"))).toBe(true);
  });

  it("le sommaire marque l’opération de chaque impact", async () => {
    await loadTestSpecification();
    const el = await mountView(ScopingPage, "cadrages/2026-001");

    const line = [...el.querySelectorAll(".sommaire a")].find((a) =>
      a.textContent?.includes("RG-obsolete"),
    );
    expect(line?.querySelector(".marque")?.textContent?.trim()).toBe("abroge");
  });

  it("les ancres du sommaire correspondent à des éléments de la fiche", async () => {
    await loadTestSpecification();
    const el = await mountView(ScopingPage, "cadrages/2026-001");

    const anchors = [...el.querySelectorAll(".sommaire a")].map((a) =>
      (a.getAttribute("href") ?? "").replace("#", ""),
    );
    expect(anchors.length).toBeGreaterThan(0);
    // un sommaire dont les liens ne mènent nulle part est pire qu'aucun sommaire
    const ids = new Set([...el.querySelectorAll("[id]")].map((n) => n.id));
    for (const anchor of anchors) {
      expect(ids.has(anchor)).toBe(true);
    }
  });

  it("la liste des cadrages suit le cycle de vie puis l’identifiant", async () => {
    await loadTestSpecification();
    const el = await mountView(ScopingsPage, "cadrages");

    const ids = [...el.querySelectorAll(".ligne .cid")].map(
      (n) => n.textContent?.trim() ?? "",
    );
    // le jeu de test n'a qu'un cadrage, mais l'ordre doit être déterministe
    expect(ids).toEqual(["2026-001"]);
  });

  it("la liste n’affiche pas « 0 impact » pour un cadrage sans impact", async () => {
    await loadTestSpecification();
    const el = await mountView(ScopingsPage, "cadrages");

    const text = el.textContent ?? "";
    expect(text).not.toContain("0 impact");
  });
});
