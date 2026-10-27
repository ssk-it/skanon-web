import { expect } from "vitest";
import { settle, type HttpTestingController } from "../core/http/http-testing";
import { inject } from "../core/injection";
import { SpecificationStore } from "../core/repo/specification.store";

/**
 * A realistic specification, at the repo `test/test`: a domain with a diagram, a feature, an active rule and a repealed one, a delivered scoping. The rendering and accessibility tests mount their pages on it.
 */
export const TREE = {
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

export const FILES: Record<string, string> = {
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

export async function loadTestSpecification(
  http: HttpTestingController,
): Promise<void> {
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
