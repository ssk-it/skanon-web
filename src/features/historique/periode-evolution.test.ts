import { flushPromises, mount, type VueWrapper } from "@vue/test-utils";
import { beforeEach, describe, expect, it } from "vitest";
import { createMemoryHistory } from "vue-router";
import { GithubClient } from "../../core/github/github-client";
import { provideHttpTesting } from "../../core/http/http-testing";
import { inject, provide } from "../../core/injection";
import { ComparisonService } from "../../core/repo/comparaison.service";
import { RepoConfig } from "../../core/repo/repo-config";
import { createAppRouter } from "../../routeur";
import EvolutionPage from "./EvolutionPage.vue";
import { LastVisit, periodStart } from "./periodes";

/**
 * L'Évolution à l'ouverture — RG-periode-par-defaut.
 *
 * Ce qui est éprouvé ici, c'est qu'elle répond d'emblée à la question qu'on lui pose — qu'est-ce qui a changé depuis la dernière fois ? — et qu'elle dit laquelle des périodes elle a retenue.
 */

const NOW = new Date("2026-10-06T12:00:00Z");
const DAY = 86_400_000;

describe("Les périodes toutes faites", () => {
  it("remontent du nombre de jours annoncé", () => {
    expect(periodStart("7-jours", NOW, null)?.toISOString()).toBe(
      new Date(NOW.getTime() - 7 * DAY).toISOString(),
    );
    expect(periodStart("30-jours", NOW, null)?.getTime()).toBe(
      NOW.getTime() - 30 * DAY,
    );
    expect(periodStart("3-mois", NOW, null)?.getTime()).toBe(
      NOW.getTime() - 90 * DAY,
    );
  });

  it("partent de la dernière visite quand elle est connue", () => {
    const visit = new Date("2026-09-10T08:00:00Z");
    expect(periodStart("visite", NOW, visit)).toEqual(visit);
    expect(periodStart("visite", NOW, null)).toBeNull();
  });
});

/**
 * Un stockage complet, substitué à celui du banc d'essai. Ce qui est éprouvé ici est la mémoire des visites, non la capacité du navigateur à stocker.
 */
function substituteStorage(name: "localStorage" | "sessionStorage"): void {
  let values: Record<string, string> = {};
  Object.defineProperty(globalThis, name, {
    configurable: true,
    value: {
      getItem: (c: string) => values[c] ?? null,
      setItem: (c: string, v: string) => void (values[c] = v),
      removeItem: (c: string) => void delete values[c],
      clear: () => void (values = {}),
    },
  });
}

describe("La dernière visite", () => {
  const repoRef = { owner: "org", repo: "depot" };

  beforeEach(() => {
    substituteStorage("localStorage");
    substituteStorage("sessionStorage");
  });

  it("n’existe pas à la première visite, et s’enregistre", () => {
    const v = new LastVisit();

    expect(v.visit(repoRef, NOW)).toBeNull();
    expect(localStorage.getItem("pc-evolution-visite:org/depot")).toBe(
      NOW.toISOString(),
    );
  });

  it("rend la visite précédente, figée pour la session", () => {
    localStorage.setItem(
      "pc-evolution-visite:org/depot",
      "2026-09-10T08:00:00.000Z",
    );
    const v = new LastVisit();

    expect(v.visit(repoRef, NOW)?.toISOString()).toBe(
      "2026-09-10T08:00:00.000Z",
    );
    // un rechargement dans la même session ne ramène pas la période à une minute
    const later = new Date(NOW.getTime() + 60_000);
    expect(v.visit(repoRef, later)?.toISOString()).toBe(
      "2026-09-10T08:00:00.000Z",
    );
  });

  it("appartient au projet", () => {
    localStorage.setItem(
      "pc-evolution-visite:org/autre",
      "2026-09-10T08:00:00.000Z",
    );

    expect(new LastVisit().visit(repoRef, NOW)).toBeNull();
  });
});

describe("L’Évolution à l’ouverture", () => {
  let calls: Array<{ departure: Date; arrival: Date }>;
  let visit: Date | null;

  async function mountView(): Promise<VueWrapper> {
    provideHttpTesting();
    provide(ComparisonService, {
      compare: async (_d: unknown, departure: Date, arrival: Date) => {
        calls.push({ departure, arrival });
        throw new Error("pas de comparaison dans ce test");
      },
    });
    provide(GithubClient, { firstCommitDate: async () => null });
    provide(LastVisit, { visit: () => visit });
    inject(RepoConfig).saveRepo({ owner: "org", repo: "depot" });
    const router = createAppRouter(createMemoryHistory());
    // La racine, non la route de la vue : son garde chargerait le référentiel, que le banc de SSK Canon ne montait pas (`provideRouter([])`).
    await router.push("/");
    await router.isReady();
    return mount(EvolutionPage, { global: { plugins: [router] } });
  }

  async function stable(f: VueWrapper): Promise<HTMLElement> {
    await flushPromises();
    return f.element as HTMLElement;
  }

  function daysBefore(d: Date): number {
    return Math.round((Date.now() - d.getTime()) / DAY);
  }

  beforeEach(() => {
    calls = [];
    visit = null;
  });

  it("compare d’emblée les trente derniers jours à la première visite, et le dit", async () => {
    const el = await stable(await mountView());

    expect(calls.length).toBe(1);
    expect(daysBefore(calls[0].departure)).toBe(30);
    expect(el.querySelector(".periode-retenue")?.textContent).toContain(
      "30 derniers jours",
    );
    expect(el.querySelector('[aria-pressed="true"]')?.textContent?.trim()).toBe(
      "30 jours",
    );
  });

  it("compare depuis la dernière visite quand elle est connue", async () => {
    visit = new Date(Date.now() - 12 * DAY);
    const el = await stable(await mountView());

    expect(calls[0].departure.getTime()).toBeLessThanOrEqual(visit.getTime());
    expect(visit.getTime() - calls[0].departure.getTime()).toBeLessThan(60_000);
    expect(el.querySelector(".periode-retenue")?.textContent).toContain(
      "dernière visite",
    );
    expect(el.querySelector('[aria-pressed="true"]')?.textContent?.trim()).toBe(
      "Depuis ma dernière visite",
    );
  });

  it("ne propose pas la dernière visite quand il n’y en a pas", async () => {
    const el = await stable(await mountView());

    const labels = [...el.querySelectorAll(".periodes button")].map((b) =>
      b.textContent?.trim(),
    );
    expect(labels).toEqual([
      "7 jours",
      "30 jours",
      "3 mois",
      "Choisir les dates…",
    ]);
  });

  it("change de période d’un geste", async () => {
    const f = await mountView();
    const el = await stable(f);

    [...el.querySelectorAll<HTMLButtonElement>(".periodes button")]
      .find((b) => b.textContent?.trim() === "7 jours")!
      .click();
    await stable(f);

    expect(calls.length).toBe(2);
    expect(daysBefore(calls[1].departure)).toBe(7);
  });

  it("ne montre les dates libres que sur demande", async () => {
    const f = await mountView();
    const el = await stable(f);
    expect(el.querySelector("form.bornes")).toBeNull();

    [...el.querySelectorAll<HTMLButtonElement>(".periodes button")]
      .find((b) => b.textContent?.includes("Choisir"))!
      .click();
    await stable(f);

    expect(el.querySelector("form.bornes")).not.toBeNull();
    // choisir ses dates ne relance rien tant qu'on n'a pas comparé
    expect(calls.length).toBe(1);
  });
});
