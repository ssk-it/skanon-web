import { inject } from "../injection";
import { beforeEach, describe, expect, it } from "vitest";
import { createMemoryHistory, type Router } from "vue-router";
import { createRouteur } from "../../routeur";
import { TitreStrategy } from "./titre.strategy";
import { Referentiel } from "../model/model";
import { ReferentielStore } from "./referentiel.store";

/**
 * Le titre de la page — ce que l'historique du navigateur retient.
 *
 * Les titres déclarés par les routes sont identiques d'un projet à l'autre et
 * d'un élément à l'autre : une dizaine d'entrées « Règle de gestion — SSK
 * Canon » ne permettent de retrouver aucune des pages qu'elles désignent.
 */
describe("Titre de la page", () => {
  let router: Router;
  let store: ReferentielStore;
  const titre = { getTitle: () => document.title };

  beforeEach(() => {
    router = createRouteur(createMemoryHistory());
    inject(TitreStrategy).attach(router);
    store = inject(ReferentielStore);
  });

  /** Pose un référentiel chargé, sans passer par le réseau. */
  function chargerReferentiel(
    partiel: Partial<Referentiel["projet"]> = {},
    contenu = {},
  ) {
    const actuel = store.referentiel();
    store.referentiel.set({
      ...actuel,
      projet: {
        ...actuel.projet,
        nom: "Explorateur S3",
        prefixe: null,
        ...partiel,
      },
      ...contenu,
    } as Referentiel);
  }

  it("nomme le dépôt tant que le référentiel n’est pas chargé", async () => {
    // L'adresse porte le dépôt dès la navigation ; le nom lisible n'arrive
    // qu'après. Un titre muet en attendant ne dirait rien à l'historique.
    await router.push("/ssk-it/exemple-cadrage/referentiel");

    expect(titre.getTitle()).toBe(
      "Référentiel — ssk-it/exemple-cadrage — Skanon",
    );
  });

  it("nomme le projet dès que le référentiel est chargé", async () => {
    await router.push("/ssk-it/exemple-cadrage/referentiel");

    chargerReferentiel();

    expect(titre.getTitle()).toBe("Référentiel — Explorateur S3 — Skanon");
  });

  it("retombe sur le dépôt quand le projet ne déclare pas de nom", async () => {
    await router.push("/ssk-it/exemple-cadrage/referentiel");

    // « Projet » est le nom par défaut : il ne distingue rien.
    chargerReferentiel({ nom: "Projet" });

    expect(titre.getTitle()).toContain("ssk-it/exemple-cadrage");
  });

  it("porte l’identifiant de l’élément consulté", async () => {
    await router.push(
      "/ssk-it/projet/referentiel/regle/RG-lien-partage-presigne",
    );

    expect(titre.getTitle()).toContain("RG-lien-partage-presigne");
  });

  it("remplace l’intitulé générique par l’élément", async () => {
    // « Règle de gestion » ne distingue rien : c'est l'identifiant qui compte.
    await router.push(
      "/ssk-it/projet/referentiel/regle/RG-secret-au-trousseau",
    );

    expect(titre.getTitle()).not.toContain("Règle de gestion");
    expect(titre.getTitle()).toBe(
      "RG-secret-au-trousseau — ssk-it/projet — Skanon",
    );
  });

  it("ajoute le titre du cadrage à son identifiant", async () => {
    await router.push("/ssk-it/projet/cadrages/2026-016");

    chargerReferentiel(
      {},
      {
        cadrages: new Map([
          ["2026-016", { id: "2026-016", titre: "Donner accès à un fichier" }],
        ]),
      },
    );

    expect(titre.getTitle()).toBe(
      "2026-016 Donner accès à un fichier — Explorateur S3 — Skanon",
    );
  });

  it("ajoute le nom du domaine à son identifiant", async () => {
    await router.push("/ssk-it/projet/referentiel/domaine/exploration");

    chargerReferentiel(
      {},
      {
        domaines: new Map([
          ["exploration", { id: "exploration", nom: "Exploration" }],
        ]),
      },
    );

    expect(titre.getTitle()).toContain("exploration Exploration");
  });

  it("affiche l’identifiant préfixé comme le reste de l’application", async () => {
    // RG-prefixe-projet : le préfixe s'ajoute à l'affichage, et le titre est un
    // affichage comme un autre.
    await router.push("/ssk-it/projet/cadrages/2026-016");

    chargerReferentiel({ prefixe: "TSE" });

    expect(titre.getTitle()).toContain("TSE-2026-016");
  });

  it("se contente de l’identifiant quand l’élément n’est pas encore connu", async () => {
    // Quitter la page avant la fin du chargement ne doit pas laisser un titre
    // générique dans l'historique.
    await router.push("/ssk-it/projet/cadrages/2026-016");

    expect(titre.getTitle()).toBe("2026-016 — ssk-it/projet — Skanon");
  });

  it("garde un titre lisible hors de tout projet", async () => {
    await router.push("/");

    expect(titre.getTitle()).toContain("Ouvrir un projet");
    expect(titre.getTitle()).toContain("Skanon");
  });
});
