import { flushPromises, mount } from "@vue/test-utils";
import { beforeEach, describe, expect, it } from "vitest";
import { createMemoryHistory } from "vue-router";
import { provideHttpTesting } from "../../core/http/http-testing";
import { inject } from "../../core/injection";
import {
  DEFAULT_LINK_TAGS,
  type Scoping,
  type Specification,
  type Rule,
} from "../../core/model/model";
import { SpecificationStore } from "../../core/repo/specification.store";
import { RepoConfig } from "../../core/repo/repo-config";
import { createAppRouter } from "../../router";
import SpecificationPage from "./SpecificationPage.vue";

/**
 * La page d'entrée du référentiel — RG-vue-ensemble-fonctionnelle.
 *
 * Ce qui est éprouvé ici, c'est qu'elle montre ce qui bouge avant ce qui est, les cadrages en cours à part, et qu'une fonctionnalité s'atteint sans passer par la fiche de son domaine.
 */

function scoping(
  id: string,
  title: string,
  extra: Partial<Scoping> = {},
): Scoping {
  return {
    id,
    title,
    status: "livree",
    domains: [],
    links: [],
    impacts: [],
    goal: "",
    journey: "",
    statements: new Map(),
    decisions: [],
    attachments: [],
    misc: [],
    ...extra,
  };
}

function rule(id: string, features: string[]): [string, Rule] {
  return [
    id,
    {
      id,
      status: "actif",
      features,
      statement: "",
      createdBy: null,
      modifiedBy: [],
    },
  ];
}

function specification(scopings: Scoping[]): Specification {
  return {
    project: { name: "Test", description: "", codeRepos: [], prefix: null },
    settings: {
      access: "jeton_personnel",
      identity: null,
      tokenProtection: "proposee",
      linkTags: DEFAULT_LINK_TAGS,
    },
    domains: new Map([
      [
        "facturation",
        {
          id: "facturation",
          name: "Facturation",
          description: "Les factures.",
        },
      ],
      [
        "clients",
        { id: "clients", name: "Clients", description: "Les clients." },
      ],
    ]),
    features: new Map([
      [
        "relance",
        {
          id: "relance",
          name: "Relance des impayés",
          domains: ["facturation"],
          description: "",
        },
      ],
      [
        "litiges",
        {
          id: "litiges",
          name: "Litiges",
          domains: ["facturation", "clients"],
          description: "",
        },
      ],
    ]),
    rules: new Map([
      rule("RG-delai", ["relance"]),
      rule("RG-limite", ["relance", "litiges"]),
      rule("RG-mediation", ["litiges"]),
    ]),
    decisions: new Map(),
    architecture: new Map(),
    scopings: new Map(scopings.map((c) => [c.id, c])),
    anomalies: [],
  };
}

const DELIVERED = [
  scoping("2026-001", "Le socle"),
  scoping("2026-002", "Relancer deux fois"),
  scoping("2026-003", "Relancer trois fois"),
  scoping("2026-004", "Ouvrir les litiges"),
];

const IN_PROGRESS = scoping("2026-005", "Arbitrer les litiges", {
  status: "en_relecture",
  provenance: {
    branch: "cadrage-2026-005",
    pullRequest: 12,
    draft: false,
  },
});

async function mountView(scopings: Scoping[]): Promise<HTMLElement> {
  const store = inject(SpecificationStore);
  store.specification.set(specification(scopings));
  store.state.set("pret");
  // Le dépôt de l'adresse est celui déjà ouvert, et le store est prêt : le garde ne recharge rien.
  const router = createAppRouter(createMemoryHistory());
  await router.push("/org/depot/referentiel");
  await router.isReady();
  const view = mount(SpecificationPage, { global: { plugins: [router] } });
  await flushPromises();
  return view.element as HTMLElement;
}

function ids(el: Element | null): string[] {
  return [...(el?.querySelectorAll(".cid") ?? [])].map(
    (c) => c.textContent?.trim() ?? "",
  );
}

describe("La vue d’ensemble du référentiel", () => {
  beforeEach(() => {
    provideHttpTesting();
    inject(RepoConfig).saveRepo({ owner: "org", repo: "depot" });
  });

  describe("ce qui bouge", () => {
    it("montre les trois derniers cadrages livrés, par identifiant", async () => {
      const el = await mountView([...DELIVERED, IN_PROGRESS]);

      expect(ids(el.querySelector(".livres"))).toEqual([
        "2026-004",
        "2026-003",
        "2026-002",
      ]);
    });

    it("montre les cadrages en cours à part, marqués de leur demande de fusion", async () => {
      const el = await mountView([...DELIVERED, IN_PROGRESS]);

      const inProgress = el.querySelector(".en-cours");
      expect(ids(inProgress)).toEqual(["2026-005"]);
      expect(inProgress?.textContent).toContain("#12");
      expect(ids(el.querySelector(".livres"))).not.toContain("2026-005");
    });

    it("garde l’emplacement des en cours, et dit ce qu’il accueillerait", async () => {
      const el = await mountView(DELIVERED);

      const inProgress = el.querySelector(".en-cours");
      expect(inProgress).not.toBeNull();
      expect(inProgress?.textContent).toContain(
        "Aucun cadrage n’est en discussion",
      );
      expect(
        inProgress?.querySelector('a[href$="/cadrages/nouveau"]'),
      ).not.toBeNull();
    });

    it("précède les domaines", async () => {
      const el = await mountView(DELIVERED);

      const moves = el.querySelector(".bouge")!;
      const domains = el.querySelector(".grille")!;
      expect(
        moves.compareDocumentPosition(domains) &
          Node.DOCUMENT_POSITION_FOLLOWING,
      ).toBeTruthy();
    });
  });

  describe("les domaines", () => {
    it("listent leurs fonctionnalités et leur nombre de règles", async () => {
      const el = await mountView(DELIVERED);

      const billing = [...el.querySelectorAll(".carte")].find((c) =>
        c.querySelector("h2")?.textContent?.includes("Facturation"),
      )!;
      const lines = [...billing.querySelectorAll(".fonctionnalites li")].map(
        (l) => [
          l.querySelector("a")?.textContent?.trim(),
          l.querySelector(".aussi")?.textContent?.trim() ?? null,
          l.querySelector(".nb")?.textContent?.trim(),
        ],
      );
      expect(lines).toEqual([
        ["Litiges", "· aussi Clients", "2"],
        ["Relance des impayés", null, "2"],
      ]);
      expect(
        billing.querySelector('a[href$="/referentiel/fonctionnalite/relance"]'),
      ).not.toBeNull();
    });

    it("mènent à leur fiche par leur nom, qui porte leur couleur", async () => {
      const el = await mountView(DELIVERED);

      const name = el.querySelector<HTMLAnchorElement>(".carte h2 a")!;
      expect(name.getAttribute("href")).toMatch(/\/referentiel\/domaine\//);
      expect(name.closest(".carte")!.getAttribute("style")).toContain(
        "--pc-domaine",
      );
    });
  });
});
