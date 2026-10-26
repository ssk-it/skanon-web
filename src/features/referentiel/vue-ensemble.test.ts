import { flushPromises, mount } from "@vue/test-utils";
import { beforeEach, describe, expect, it } from "vitest";
import { createMemoryHistory } from "vue-router";
import { provideHttpTesting } from "../../core/http/http-testing";
import { inject } from "../../core/injection";
import {
  TAGS_LIENS_PAR_DEFAUT,
  type Cadrage,
  type Referentiel,
  type Regle,
} from "../../core/model/model";
import { ReferentielStore } from "../../core/repo/referentiel.store";
import { RepoConfig } from "../../core/repo/repo-config";
import { createRouteur } from "../../routeur";
import ReferentielPage from "./ReferentielPage.vue";

/**
 * La page d'entrée du référentiel — RG-vue-ensemble-fonctionnelle.
 *
 * Ce qui est éprouvé ici, c'est qu'elle montre ce qui bouge avant ce qui est, les cadrages en cours à part, et qu'une fonctionnalité s'atteint sans passer par la fiche de son domaine.
 */

function cadrage(
  id: string,
  titre: string,
  extra: Partial<Cadrage> = {},
): Cadrage {
  return {
    id,
    titre,
    statut: "livree",
    domaines: [],
    liens: [],
    impacts: [],
    objectif: "",
    parcours: "",
    enonces: new Map(),
    decisions: [],
    piecesJointes: [],
    divers: [],
    ...extra,
  };
}

function regle(id: string, fonctionnalites: string[]): [string, Regle] {
  return [
    id,
    {
      id,
      statut: "actif",
      fonctionnalites,
      enonce: "",
      creePar: null,
      modifiePar: [],
    },
  ];
}

function referentiel(cadrages: Cadrage[]): Referentiel {
  return {
    projet: { nom: "Test", description: "", depotsCode: [], prefixe: null },
    reglages: {
      acces: "jeton_personnel",
      identite: null,
      protectionDuJeton: "proposee",
      tagsLiens: TAGS_LIENS_PAR_DEFAUT,
    },
    domaines: new Map([
      [
        "facturation",
        {
          id: "facturation",
          nom: "Facturation",
          description: "Les factures.",
        },
      ],
      [
        "clients",
        { id: "clients", nom: "Clients", description: "Les clients." },
      ],
    ]),
    fonctionnalites: new Map([
      [
        "relance",
        {
          id: "relance",
          nom: "Relance des impayés",
          domaines: ["facturation"],
          description: "",
        },
      ],
      [
        "litiges",
        {
          id: "litiges",
          nom: "Litiges",
          domaines: ["facturation", "clients"],
          description: "",
        },
      ],
    ]),
    regles: new Map([
      regle("RG-delai", ["relance"]),
      regle("RG-limite", ["relance", "litiges"]),
      regle("RG-mediation", ["litiges"]),
    ]),
    decisions: new Map(),
    architecture: new Map(),
    cadrages: new Map(cadrages.map((c) => [c.id, c])),
    anomalies: [],
  };
}

const LIVRES = [
  cadrage("2026-001", "Le socle"),
  cadrage("2026-002", "Relancer deux fois"),
  cadrage("2026-003", "Relancer trois fois"),
  cadrage("2026-004", "Ouvrir les litiges"),
];

const EN_COURS = cadrage("2026-005", "Arbitrer les litiges", {
  statut: "en_relecture",
  provenance: {
    branche: "cadrage-2026-005",
    pullRequest: 12,
    brouillon: false,
  },
});

async function monter(cadrages: Cadrage[]): Promise<HTMLElement> {
  const store = inject(ReferentielStore);
  store.referentiel.set(referentiel(cadrages));
  store.etat.set("pret");
  // Le dépôt de l'adresse est celui déjà ouvert, et le store est prêt : le garde ne recharge rien.
  const routeur = createRouteur(createMemoryHistory());
  await routeur.push("/org/depot/referentiel");
  await routeur.isReady();
  const vue = mount(ReferentielPage, { global: { plugins: [routeur] } });
  await flushPromises();
  return vue.element as HTMLElement;
}

function ids(el: Element | null): string[] {
  return [...(el?.querySelectorAll(".cid") ?? [])].map(
    (c) => c.textContent?.trim() ?? "",
  );
}

describe("La vue d’ensemble du référentiel", () => {
  beforeEach(() => {
    provideHttpTesting();
    inject(RepoConfig).saveDepot({ owner: "org", repo: "depot" });
  });

  describe("ce qui bouge", () => {
    it("montre les trois derniers cadrages livrés, par identifiant", async () => {
      const el = await monter([...LIVRES, EN_COURS]);

      expect(ids(el.querySelector(".livres"))).toEqual([
        "2026-004",
        "2026-003",
        "2026-002",
      ]);
    });

    it("montre les cadrages en cours à part, marqués de leur demande de fusion", async () => {
      const el = await monter([...LIVRES, EN_COURS]);

      const enCours = el.querySelector(".en-cours");
      expect(ids(enCours)).toEqual(["2026-005"]);
      expect(enCours?.textContent).toContain("#12");
      expect(ids(el.querySelector(".livres"))).not.toContain("2026-005");
    });

    it("garde l’emplacement des en cours, et dit ce qu’il accueillerait", async () => {
      const el = await monter(LIVRES);

      const enCours = el.querySelector(".en-cours");
      expect(enCours).not.toBeNull();
      expect(enCours?.textContent).toContain(
        "Aucun cadrage n’est en discussion",
      );
      expect(
        enCours?.querySelector('a[href$="/cadrages/nouveau"]'),
      ).not.toBeNull();
    });

    it("précède les domaines", async () => {
      const el = await monter(LIVRES);

      const bouge = el.querySelector(".bouge")!;
      const domaines = el.querySelector(".grille")!;
      expect(
        bouge.compareDocumentPosition(domaines) &
          Node.DOCUMENT_POSITION_FOLLOWING,
      ).toBeTruthy();
    });
  });

  describe("les domaines", () => {
    it("listent leurs fonctionnalités et leur nombre de règles", async () => {
      const el = await monter(LIVRES);

      const facturation = [...el.querySelectorAll(".carte")].find((c) =>
        c.querySelector("h2")?.textContent?.includes("Facturation"),
      )!;
      const lignes = [
        ...facturation.querySelectorAll(".fonctionnalites li"),
      ].map((l) => [
        l.querySelector("a")?.textContent?.trim(),
        l.querySelector(".aussi")?.textContent?.trim() ?? null,
        l.querySelector(".nb")?.textContent?.trim(),
      ]);
      expect(lignes).toEqual([
        ["Litiges", "· aussi Clients", "2"],
        ["Relance des impayés", null, "2"],
      ]);
      expect(
        facturation.querySelector(
          'a[href$="/referentiel/fonctionnalite/relance"]',
        ),
      ).not.toBeNull();
    });

    it("mènent à leur fiche par leur nom, qui porte leur couleur", async () => {
      const el = await monter(LIVRES);

      const nom = el.querySelector<HTMLAnchorElement>(".carte h2 a")!;
      expect(nom.getAttribute("href")).toMatch(/\/referentiel\/domaine\//);
      expect(nom.closest(".carte")!.getAttribute("style")).toContain(
        "--pc-domaine",
      );
    });
  });
});
