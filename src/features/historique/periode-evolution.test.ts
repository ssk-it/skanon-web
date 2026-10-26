import { flushPromises, mount, type VueWrapper } from "@vue/test-utils";
import { beforeEach, describe, expect, it } from "vitest";
import { createMemoryHistory } from "vue-router";
import { GithubClient } from "../../core/github/github-client";
import { provideHttpTesting } from "../../core/http/http-testing";
import { inject, provide } from "../../core/injection";
import { ComparaisonService } from "../../core/repo/comparaison.service";
import { RepoConfig } from "../../core/repo/repo-config";
import { createRouteur } from "../../routeur";
import EvolutionPage from "./EvolutionPage.vue";
import { DerniereVisite, debutPeriode } from "./periodes";

/**
 * L'Évolution à l'ouverture — RG-periode-par-defaut.
 *
 * Ce qui est éprouvé ici, c'est qu'elle répond d'emblée à la question qu'on lui pose — qu'est-ce qui a changé depuis la dernière fois ? — et qu'elle dit laquelle des périodes elle a retenue.
 */

const MAINTENANT = new Date("2026-10-06T12:00:00Z");
const JOUR = 86_400_000;

describe("Les périodes toutes faites", () => {
  it("remontent du nombre de jours annoncé", () => {
    expect(debutPeriode("7-jours", MAINTENANT, null)?.toISOString()).toBe(
      new Date(MAINTENANT.getTime() - 7 * JOUR).toISOString(),
    );
    expect(debutPeriode("30-jours", MAINTENANT, null)?.getTime()).toBe(
      MAINTENANT.getTime() - 30 * JOUR,
    );
    expect(debutPeriode("3-mois", MAINTENANT, null)?.getTime()).toBe(
      MAINTENANT.getTime() - 90 * JOUR,
    );
  });

  it("partent de la dernière visite quand elle est connue", () => {
    const visite = new Date("2026-09-10T08:00:00Z");
    expect(debutPeriode("visite", MAINTENANT, visite)).toEqual(visite);
    expect(debutPeriode("visite", MAINTENANT, null)).toBeNull();
  });
});

/**
 * Un stockage complet, substitué à celui du banc d'essai. Ce qui est éprouvé ici est la mémoire des visites, non la capacité du navigateur à stocker.
 */
function substituerStockage(nom: "localStorage" | "sessionStorage"): void {
  let valeurs: Record<string, string> = {};
  Object.defineProperty(globalThis, nom, {
    configurable: true,
    value: {
      getItem: (c: string) => valeurs[c] ?? null,
      setItem: (c: string, v: string) => void (valeurs[c] = v),
      removeItem: (c: string) => void delete valeurs[c],
      clear: () => void (valeurs = {}),
    },
  });
}

describe("La dernière visite", () => {
  const depot = { owner: "org", repo: "depot" };

  beforeEach(() => {
    substituerStockage("localStorage");
    substituerStockage("sessionStorage");
  });

  it("n’existe pas à la première visite, et s’enregistre", () => {
    const v = new DerniereVisite();

    expect(v.consulter(depot, MAINTENANT)).toBeNull();
    expect(localStorage.getItem("pc-evolution-visite:org/depot")).toBe(
      MAINTENANT.toISOString(),
    );
  });

  it("rend la visite précédente, figée pour la session", () => {
    localStorage.setItem(
      "pc-evolution-visite:org/depot",
      "2026-09-10T08:00:00.000Z",
    );
    const v = new DerniereVisite();

    expect(v.consulter(depot, MAINTENANT)?.toISOString()).toBe(
      "2026-09-10T08:00:00.000Z",
    );
    // un rechargement dans la même session ne ramène pas la période à une minute
    const plusTard = new Date(MAINTENANT.getTime() + 60_000);
    expect(v.consulter(depot, plusTard)?.toISOString()).toBe(
      "2026-09-10T08:00:00.000Z",
    );
  });

  it("appartient au projet", () => {
    localStorage.setItem(
      "pc-evolution-visite:org/autre",
      "2026-09-10T08:00:00.000Z",
    );

    expect(new DerniereVisite().consulter(depot, MAINTENANT)).toBeNull();
  });
});

describe("L’Évolution à l’ouverture", () => {
  let appels: Array<{ depart: Date; arrivee: Date }>;
  let visite: Date | null;

  async function monter(): Promise<VueWrapper> {
    provideHttpTesting();
    provide(ComparaisonService, {
      comparer: async (_d: unknown, depart: Date, arrivee: Date) => {
        appels.push({ depart, arrivee });
        throw new Error("pas de comparaison dans ce test");
      },
    });
    provide(GithubClient, { dateDuPremierCommit: async () => null });
    provide(DerniereVisite, { consulter: () => visite });
    inject(RepoConfig).saveDepot({ owner: "org", repo: "depot" });
    const router = createRouteur(createMemoryHistory());
    // La racine, non la route de la vue : son garde chargerait le référentiel, que le banc de SSK Canon ne montait pas (`provideRouter([])`).
    await router.push("/");
    await router.isReady();
    return mount(EvolutionPage, { global: { plugins: [router] } });
  }

  async function stable(f: VueWrapper): Promise<HTMLElement> {
    await flushPromises();
    return f.element as HTMLElement;
  }

  function joursAvant(d: Date): number {
    return Math.round((Date.now() - d.getTime()) / JOUR);
  }

  beforeEach(() => {
    appels = [];
    visite = null;
  });

  it("compare d’emblée les trente derniers jours à la première visite, et le dit", async () => {
    const el = await stable(await monter());

    expect(appels.length).toBe(1);
    expect(joursAvant(appels[0].depart)).toBe(30);
    expect(el.querySelector(".periode-retenue")?.textContent).toContain(
      "30 derniers jours",
    );
    expect(el.querySelector('[aria-pressed="true"]')?.textContent?.trim()).toBe(
      "30 jours",
    );
  });

  it("compare depuis la dernière visite quand elle est connue", async () => {
    visite = new Date(Date.now() - 12 * JOUR);
    const el = await stable(await monter());

    expect(appels[0].depart.getTime()).toBeLessThanOrEqual(visite.getTime());
    expect(visite.getTime() - appels[0].depart.getTime()).toBeLessThan(60_000);
    expect(el.querySelector(".periode-retenue")?.textContent).toContain(
      "dernière visite",
    );
    expect(el.querySelector('[aria-pressed="true"]')?.textContent?.trim()).toBe(
      "Depuis ma dernière visite",
    );
  });

  it("ne propose pas la dernière visite quand il n’y en a pas", async () => {
    const el = await stable(await monter());

    const libelles = [...el.querySelectorAll(".periodes button")].map((b) =>
      b.textContent?.trim(),
    );
    expect(libelles).toEqual([
      "7 jours",
      "30 jours",
      "3 mois",
      "Choisir les dates…",
    ]);
  });

  it("change de période d’un geste", async () => {
    const f = await monter();
    const el = await stable(f);

    [...el.querySelectorAll<HTMLButtonElement>(".periodes button")]
      .find((b) => b.textContent?.trim() === "7 jours")!
      .click();
    await stable(f);

    expect(appels.length).toBe(2);
    expect(joursAvant(appels[1].depart)).toBe(7);
  });

  it("ne montre les dates libres que sur demande", async () => {
    const f = await monter();
    const el = await stable(f);
    expect(el.querySelector("form.bornes")).toBeNull();

    [...el.querySelectorAll<HTMLButtonElement>(".periodes button")]
      .find((b) => b.textContent?.includes("Choisir"))!
      .click();
    await stable(f);

    expect(el.querySelector("form.bornes")).not.toBeNull();
    // choisir ses dates ne relance rien tant qu'on n'a pas comparé
    expect(appels.length).toBe(1);
  });
});
