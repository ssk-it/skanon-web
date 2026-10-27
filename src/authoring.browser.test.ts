import { flushPromises } from "@vue/test-utils";
import { afterEach, beforeAll, describe, expect, it } from "vitest";
import { page } from "vitest/browser";
import {
  close,
  open,
  overflows,
  preloadMermaid,
  violations,
} from "./accessibility-testing";
import { TokenService } from "./core/github/token.service";
import { inject, provide } from "./core/injection";
import { AuthoringService } from "./core/repo/authoring.service";

/**
 * RG-accessibilite-aa, for whoever writes: the forms as a signed-in author sees them — a token in place, the scoping to resume loaded —, run through axe in both themes then at the width of a 200 % zoom. Without a token, these pages show only a warning, or wait for a load nothing serves.
 */
afterEach(close);

beforeAll(preloadMermaid, 60_000);

const CONTENT = `---
id: 2026-001
titre: Relance automatique
domaines: [facturation]
impacts:
  - { regle: RG-limite, operation: cree }
---

## Objectif

Réduire le délai d'encaissement.

## Parcours utilisateur

1. Une facture échoit.
2. Une relance part.

## Énoncés

### RG-limite

Une facture fait l'objet de **trois** relances au maximum.
`;

/** A signed-in author, and the resumption of a scoping served without GitHub. */
function author(): void {
  inject(TokenService).set("github_pat_essai");
  // The real service, of which only reading the scoping to resume is served here: the rest — the next identifier, the toggles — stays its own.
  const real = inject(AuthoringService);
  provide(
    AuthoringService,
    Object.assign(Object.create(real) as AuthoringService, {
      loadForEditing: async () => ({
        source: {
          branch: "cadrage/2026-001",
          path: "cadrages/2026-001/cadrage.md",
          sha: "x",
        },
        content: CONTENT,
        context: null,
        mainBranch: "main",
      }),
      loadDecisions: async () => [],
    }),
  );
}

const FORMS = [
  "/test/test/cadrages/nouveau",
  "/test/test/cadrages/2026-001/editer",
  "/test/test/reglages",
];

describe("authoring forms, signed in — RG-accessibilite-aa", () => {
  describe.each([["clair"], ["sombre"]])("theme %s", (theme) => {
    it.each(FORMS)(
      "%s has no violation axe can see",
      async (address) => {
        document.documentElement.dataset["theme"] = theme;
        const root = await open(address, author);
        expect(document.querySelector(".avertissement")).toBeNull();
        expect(document.querySelector("form, input, textarea")).not.toBeNull();
        expect(await violations(root)).toEqual([]);
      },
      30_000,
    );
  });

  it("announces the missing fields of a new scoping, without violation", async () => {
    const root = await open("/test/test/cadrages/nouveau", author);
    const create = [...document.querySelectorAll("button")].find((b) =>
      /créer|enregistrer/i.test(b.textContent ?? ""),
    );
    if (!create) throw new Error("Create button not found");
    create.click();
    await flushPromises();
    expect(
      document.querySelector(".incomplet, .erreur, [aria-invalid='true']"),
    ).not.toBeNull();
    expect(await violations(root)).toEqual([]);
  }, 30_000);

  describe("at 200 % zoom", () => {
    beforeAll(async () => {
      await page.viewport(640, 400);
    });

    it.each(FORMS)(
      "%s does not overflow",
      async (address) => {
        await open(address, author);
        expect(overflows()).toEqual([]);
      },
      30_000,
    );
  });
});
