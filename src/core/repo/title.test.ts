import { inject } from "../injection";
import { beforeEach, describe, expect, it } from "vitest";
import { createMemoryHistory, type Router } from "vue-router";
import { createAppRouter } from "../../router";
import { TitleStrategy } from "./title.strategy";
import { Specification } from "../model/model";
import { SpecificationStore } from "./specification.store";

/**
 * The page title — what the browser history keeps.
 *
 * The titles declared by routes are identical from one project to another and
 * from one item to another: a dozen « Règle de gestion — SSK Canon » entries
 * make it impossible to find any of the pages they designate.
 */
describe("Page title", () => {
  let router: Router;
  let store: SpecificationStore;
  const title = { getTitle: () => document.title };

  beforeEach(() => {
    router = createAppRouter(createMemoryHistory());
    inject(TitleStrategy).attach(router);
    store = inject(SpecificationStore);
  });

  /** Sets a loaded specification, without going through the network. */
  function loadTestSpecification(
    partial: Partial<Specification["project"]> = {},
    content = {},
  ) {
    const current = store.specification();
    store.specification.set({
      ...current,
      project: {
        ...current.project,
        name: "Explorateur S3",
        prefix: null,
        ...partial,
      },
      ...content,
    } as Specification);
  }

  it("names the repo as long as the specification is not loaded", async () => {
    // The address carries the repo from navigation; the readable name only
    // arrives afterwards. A silent title meanwhile would tell the history nothing.
    await router.push("/ssk-it/exemple-cadrage/referentiel");

    expect(title.getTitle()).toBe(
      "Référentiel — ssk-it/exemple-cadrage — Skanon",
    );
  });

  it("names the project as soon as the specification is loaded", async () => {
    await router.push("/ssk-it/exemple-cadrage/referentiel");

    loadTestSpecification();

    expect(title.getTitle()).toBe("Référentiel — Explorateur S3 — Skanon");
  });

  it("falls back on the repo when the project declares no name", async () => {
    await router.push("/ssk-it/exemple-cadrage/referentiel");

    // « Projet » is the default name: it distinguishes nothing.
    loadTestSpecification({ name: "Projet" });

    expect(title.getTitle()).toContain("ssk-it/exemple-cadrage");
  });

  it("carries the identifier of the consulted item", async () => {
    await router.push(
      "/ssk-it/projet/referentiel/regle/RG-lien-partage-presigne",
    );

    expect(title.getTitle()).toContain("RG-lien-partage-presigne");
  });

  it("replaces the generic label with the item", async () => {
    // « Règle de gestion » distinguishes nothing: the identifier is what counts.
    await router.push(
      "/ssk-it/projet/referentiel/regle/RG-secret-au-trousseau",
    );

    expect(title.getTitle()).not.toContain("Règle de gestion");
    expect(title.getTitle()).toBe(
      "RG-secret-au-trousseau — ssk-it/projet — Skanon",
    );
  });

  it("adds the scoping's title to its identifier", async () => {
    await router.push("/ssk-it/projet/cadrages/2026-016");

    loadTestSpecification(
      {},
      {
        scopings: new Map([
          ["2026-016", { id: "2026-016", title: "Donner accès à un fichier" }],
        ]),
      },
    );

    expect(title.getTitle()).toBe(
      "2026-016 Donner accès à un fichier — Explorateur S3 — Skanon",
    );
  });

  it("adds the domain's name to its identifier", async () => {
    await router.push("/ssk-it/projet/referentiel/domaine/exploration");

    loadTestSpecification(
      {},
      {
        domains: new Map([
          ["exploration", { id: "exploration", name: "Exploration" }],
        ]),
      },
    );

    expect(title.getTitle()).toContain("exploration Exploration");
  });

  it("displays the prefixed identifier like the rest of the application", async () => {
    // RG-prefixe-projet: the prefix is added on display, and the title is a
    // display like any other.
    await router.push("/ssk-it/projet/cadrages/2026-016");

    loadTestSpecification({ prefix: "TSE" });

    expect(title.getTitle()).toContain("TSE-2026-016");
  });

  it("makes do with the identifier when the item is not known yet", async () => {
    // Leaving the page before loading ends must not leave a generic title in
    // the history.
    await router.push("/ssk-it/projet/cadrages/2026-016");

    expect(title.getTitle()).toBe("2026-016 — ssk-it/projet — Skanon");
  });

  it("keeps a readable title outside any project", async () => {
    await router.push("/");

    expect(title.getTitle()).toContain("Ouvrir un projet");
    expect(title.getTitle()).toContain("Skanon");
  });
});
