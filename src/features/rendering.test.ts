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
 * Mounts the screens with a realistic specification and inspects the DOM produced.
 *
 * What is checked here is what a glance at the browser would show: that the data reach the screen, and that the model's two subtle cases — statement divergence and repeal — are visible and explained.
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

  // Content requests go out after the tree is resolved, across several microtasks and a bounded-concurrency queue: we answer whatever is in flight until exhausted rather than assume a timing.
  const remaining = new Set(Object.keys(FILES));
  // One turn of the event loop each time, not a microtask: under the load of the whole suite, a step of the read can wait longer than one turn's microtasks.
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

/** Mounts `page` at the test repo's address `path`, with the specification already loaded. */
async function mountView(page: Component, path: string): Promise<HTMLElement> {
  const router = createAppRouter(createMemoryHistory());
  await router.push(`/test/test/${path}`);
  await router.isReady();
  const view = mount(page, { global: { plugins: [router] } });
  await flushPromises();
  return view.element.parentElement ?? (view.element as HTMLElement);
}

// Mermaid weighs several megabytes, and `RenderedMarkdown` loads it on demand: under the load of the whole suite, that first load alone exceeded a test's timeout (observed once in six). Loading it beforehand, with its own timeout, leaves the tests only the behaviour to test.
beforeAll(async () => {
  await import("mermaid");
}, 60_000);

describe("screen rendering", () => {
  beforeEach(() => {
    http = provideHttpTesting();
  });

  it("the specification page lists the domains with their count", async () => {
    await loadTestSpecification();
    const el = await mountView(SpecificationPage, "referentiel");

    const text = el.textContent ?? "";
    expect(text).toContain("Facturation");
    expect(text).toContain("1 fonctionnalités");
    // the count does not include the repealed rule
    expect(text).toContain("1 règles actives");
  });

  it("the domain page lists the scopings attached to it", async () => {
    await loadTestSpecification();
    const el = await mountView(DomainPage, "referentiel/domaine/facturation");

    // The attachment is the one the scoping declares: it may touch no rule of the domain — describe only its architecture — and still have to be read there.
    const link = el.querySelector('a[href$="/cadrages/2026-001"]');
    expect(link).not.toBeNull();
    expect(link?.textContent).toContain("Relance automatique");
    expect(link?.querySelector(".statut-chip")).not.toBeNull();
  });

  it("the domain page draws the diagram instead of showing its source", async () => {
    await loadTestSpecification();
    const el = await mountView(DomainPage, "referentiel/domaine/facturation");
    await new Promise((r) => setTimeout(r, 300));
    await flushPromises();

    // The prose around the diagram is always readable.
    expect(el.textContent).toContain("Émission et suivi des factures.");
    // The block has left the form in which Markdown rendering leaves it: that is exactly what the page showed, and what was taken for the content.
    expect(el.querySelector("code.language-mermaid")).toBeNull();
    // It takes up its slot — drawn, or flagged as failed, since the engine measures text with `getBBox`, which the test environment lacks.
    expect(
      el.querySelector(".pc-diagramme, .pc-diagramme-erreur"),
    ).not.toBeNull();
  });

  it("the rule page goes back to the responsible scoping", async () => {
    await loadTestSpecification();
    const el = await mountView(RulePage, "referentiel/regle/RG-limite");

    const text = el.textContent ?? "";
    expect(text).toContain("RG-limite");
    expect(text).toContain("Relance automatique");
    expect(text).toContain("quatorze");
    expect(el.querySelector(".operation-chip")?.textContent).toContain("crée");
  });

  it("the rule page flags a repealed rule", async () => {
    await loadTestSpecification();
    const el = await mountView(RulePage, "referentiel/regle/RG-obsolete");

    expect(el.querySelector(".bandeau-abrogee")).not.toBeNull();
    expect(el.textContent).toContain("ne s’applique plus");
  });

  it("the scoping page renders goal, links and impacts", async () => {
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

  it("the scoping page gathers under « Divers » what the template ignores", async () => {
    await loadTestSpecification();
    const el = await mountView(ScopingPage, "cadrages/2026-001");

    const block = el.querySelector("#divers");
    expect(block).not.toBeNull();
    // the original title, the only thing that says what the section is about
    expect(block?.querySelector("h3")?.textContent?.trim()).toBe(
      "Ce que la mesure a montré",
    );
    expect(block?.textContent).toContain("partent le week-end");
    // and its subsection, which has nowhere else to be read
    expect(block?.textContent).toContain("Une observation, hors périmètre");
    expect(block?.textContent).toContain("ne sont pas conservés");
  });

  it("the table of contents names each section gathered under « Divers »", async () => {
    await loadTestSpecification();
    const el = await mountView(ScopingPage, "cadrages/2026-001");

    const links = el.querySelectorAll(".sommaire a");
    const labels = [...links].map((a) => a.textContent?.trim() ?? "");
    expect(labels.some((l) => l.startsWith("Divers"))).toBe(true);
    expect(labels.some((l) => l.includes("Ce que la mesure a montré"))).toBe(
      true,
    );
  });

  it("the scoping page flags a statement that diverges from the current statement", async () => {
    await loadTestSpecification();
    const el = await mountView(ScopingPage, "cadrages/2026-001");

    // the scoping says « trois », the rule says « quatorze »: the gap must be explained, otherwise the reader sees an inconsistency
    const divergence = el.querySelector(".i-divergence");
    expect(divergence).not.toBeNull();
    expect(divergence?.textContent).toContain(
      "modifié par un cadrage ultérieur",
    );
    expect(el.textContent).toContain("trois");
  });

  it("the table of contents lists the sections, the decisions and the impacts", async () => {
    await loadTestSpecification();
    const el = await mountView(ScopingPage, "cadrages/2026-001");

    const links = el.querySelectorAll(".sommaire a");
    const labels = [...links].map((a) => a.textContent?.trim() ?? "");

    // the sections present, and each impact by name — that is what one looks for when coming back to a page
    expect(labels.some((l) => l.startsWith("Objectif"))).toBe(true);
    expect(labels.some((l) => l.includes("Impacts"))).toBe(true);
    expect(labels.some((l) => l.includes("RG-limite"))).toBe(true);
    expect(labels.some((l) => l.includes("RG-obsolete"))).toBe(true);
  });

  it("the table of contents marks the operation of each impact", async () => {
    await loadTestSpecification();
    const el = await mountView(ScopingPage, "cadrages/2026-001");

    const line = [...el.querySelectorAll(".sommaire a")].find((a) =>
      a.textContent?.includes("RG-obsolete"),
    );
    expect(line?.querySelector(".marque")?.textContent?.trim()).toBe("abroge");
  });

  it("the table of contents anchors match elements of the page", async () => {
    await loadTestSpecification();
    const el = await mountView(ScopingPage, "cadrages/2026-001");

    const anchors = [...el.querySelectorAll(".sommaire a")].map((a) =>
      (a.getAttribute("href") ?? "").replace("#", ""),
    );
    expect(anchors.length).toBeGreaterThan(0);
    // a table of contents whose links lead nowhere is worse than none
    const ids = new Set([...el.querySelectorAll("[id]")].map((n) => n.id));
    for (const anchor of anchors) {
      expect(ids.has(anchor)).toBe(true);
    }
  });

  it("the scopings list follows the life cycle then the identifier", async () => {
    await loadTestSpecification();
    const el = await mountView(ScopingsPage, "cadrages");

    const ids = [...el.querySelectorAll(".ligne .cid")].map(
      (n) => n.textContent?.trim() ?? "",
    );
    // the test fixture has only one scoping, but the order must be deterministic
    expect(ids).toEqual(["2026-001"]);
  });

  it("the list does not show « 0 impact » for a scoping without impacts", async () => {
    await loadTestSpecification();
    const el = await mountView(ScopingsPage, "cadrages");

    const text = el.textContent ?? "";
    expect(text).not.toContain("0 impact");
  });
});
