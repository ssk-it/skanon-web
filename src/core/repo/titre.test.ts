import { inject } from "../injection";
import { beforeEach, describe, expect, it } from "vitest";
import { createMemoryHistory, type Router } from "vue-router";
import { createAppRouter } from "../../routeur";
import { TitleStrategy } from "./titre.strategy";
import { Specification } from "../model/model";
import { SpecificationStore } from "./referentiel.store";

/**
 * Le titre de la page — ce que l'historique du navigateur retient.
 *
 * Les titres déclarés par les routes sont identiques d'un projet à l'autre et
 * d'un élément à l'autre : une dizaine d'entrées « Règle de gestion — SSK
 * Canon » ne permettent de retrouver aucune des pages qu'elles désignent.
 */
describe("Titre de la page", () => {
  let router: Router;
  let store: SpecificationStore;
  const title = { getTitle: () => document.title };

  beforeEach(() => {
    router = createAppRouter(createMemoryHistory());
    inject(TitleStrategy).attach(router);
    store = inject(SpecificationStore);
  });

  /** Pose un référentiel chargé, sans passer par le réseau. */
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

  it("nomme le dépôt tant que le référentiel n’est pas chargé", async () => {
    // L'adresse porte le dépôt dès la navigation ; le nom lisible n'arrive
    // qu'après. Un titre muet en attendant ne dirait rien à l'historique.
    await router.push("/ssk-it/exemple-cadrage/referentiel");

    expect(title.getTitle()).toBe(
      "Référentiel — ssk-it/exemple-cadrage — Skanon",
    );
  });

  it("nomme le projet dès que le référentiel est chargé", async () => {
    await router.push("/ssk-it/exemple-cadrage/referentiel");

    loadTestSpecification();

    expect(title.getTitle()).toBe("Référentiel — Explorateur S3 — Skanon");
  });

  it("retombe sur le dépôt quand le projet ne déclare pas de nom", async () => {
    await router.push("/ssk-it/exemple-cadrage/referentiel");

    // « Projet » est le nom par défaut : il ne distingue rien.
    loadTestSpecification({ name: "Projet" });

    expect(title.getTitle()).toContain("ssk-it/exemple-cadrage");
  });

  it("porte l’identifiant de l’élément consulté", async () => {
    await router.push(
      "/ssk-it/projet/referentiel/regle/RG-lien-partage-presigne",
    );

    expect(title.getTitle()).toContain("RG-lien-partage-presigne");
  });

  it("remplace l’intitulé générique par l’élément", async () => {
    // « Règle de gestion » ne distingue rien : c'est l'identifiant qui compte.
    await router.push(
      "/ssk-it/projet/referentiel/regle/RG-secret-au-trousseau",
    );

    expect(title.getTitle()).not.toContain("Règle de gestion");
    expect(title.getTitle()).toBe(
      "RG-secret-au-trousseau — ssk-it/projet — Skanon",
    );
  });

  it("ajoute le titre du cadrage à son identifiant", async () => {
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

  it("ajoute le nom du domaine à son identifiant", async () => {
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

  it("affiche l’identifiant préfixé comme le reste de l’application", async () => {
    // RG-prefixe-projet : le préfixe s'ajoute à l'affichage, et le titre est un
    // affichage comme un autre.
    await router.push("/ssk-it/projet/cadrages/2026-016");

    loadTestSpecification({ prefix: "TSE" });

    expect(title.getTitle()).toContain("TSE-2026-016");
  });

  it("se contente de l’identifiant quand l’élément n’est pas encore connu", async () => {
    // Quitter la page avant la fin du chargement ne doit pas laisser un titre
    // générique dans l'historique.
    await router.push("/ssk-it/projet/cadrages/2026-016");

    expect(title.getTitle()).toBe("2026-016 — ssk-it/projet — Skanon");
  });

  it("garde un titre lisible hors de tout projet", async () => {
    await router.push("/");

    expect(title.getTitle()).toContain("Ouvrir un projet");
    expect(title.getTitle()).toContain("Skanon");
  });
});
