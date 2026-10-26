import { flushPromises, mount, type VueWrapper } from "@vue/test-utils";
import { beforeEach, describe, expect, it } from "vitest";
import { createMemoryHistory } from "vue-router";
import { GithubClient } from "../../core/github/github-client";
import { provideHttpTesting } from "../../core/http/http-testing";
import { LocaleService } from "../../core/i18n/locale.service";
import { inject, provide } from "../../core/injection";
import { ComparisonService } from "../../core/repo/comparison.service";
import { RepoConfig } from "../../core/repo/repo-config";
import { createAppRouter } from "../../router";
import EvolutionPage from "./EvolutionPage.vue";
import { LastVisit, periodStart } from "./periods";

/**
 * Evolution on opening — RG-periode-par-defaut.
 *
 * What is tested here is that it answers right away the question put to it — what has changed since last time? — and that it says which of the periods it chose.
 */

const NOW = new Date("2026-10-06T12:00:00Z");
const DAY = 86_400_000;

describe("The ready-made periods", () => {
  it("go back the announced number of days", () => {
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

  it("start from the last visit when it is known", () => {
    const visit = new Date("2026-09-10T08:00:00Z");
    expect(periodStart("visite", NOW, visit)).toEqual(visit);
    expect(periodStart("visite", NOW, null)).toBeNull();
  });
});

/**
 * A complete storage, substituted for the test bench's. What is tested here is the memory of visits, not the browser's ability to store.
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

describe("The last visit", () => {
  const repoRef = { owner: "org", repo: "depot" };

  beforeEach(() => {
    substituteStorage("localStorage");
    substituteStorage("sessionStorage");
  });

  it("does not exist on the first visit, and is recorded", () => {
    const v = new LastVisit();

    expect(v.visit(repoRef, NOW)).toBeNull();
    expect(localStorage.getItem("pc-evolution-visite:org/depot")).toBe(
      NOW.toISOString(),
    );
  });

  it("returns the previous visit, frozen for the session", () => {
    localStorage.setItem(
      "pc-evolution-visite:org/depot",
      "2026-09-10T08:00:00.000Z",
    );
    const v = new LastVisit();

    expect(v.visit(repoRef, NOW)?.toISOString()).toBe(
      "2026-09-10T08:00:00.000Z",
    );
    // a reload in the same session does not bring the period down to one minute
    const later = new Date(NOW.getTime() + 60_000);
    expect(v.visit(repoRef, later)?.toISOString()).toBe(
      "2026-09-10T08:00:00.000Z",
    );
  });

  it("belongs to the project", () => {
    localStorage.setItem(
      "pc-evolution-visite:org/autre",
      "2026-09-10T08:00:00.000Z",
    );

    expect(new LastVisit().visit(repoRef, NOW)).toBeNull();
  });
});

describe("Evolution on opening", () => {
  let calls: Array<{ departure: Date; arrival: Date }>;
  let visit: Date | null;
  let failure: unknown;

  async function mountView(): Promise<VueWrapper> {
    provideHttpTesting();
    provide(ComparisonService, {
      compare: async (_d: unknown, departure: Date, arrival: Date) => {
        calls.push({ departure, arrival });
        throw failure;
      },
    });
    provide(GithubClient, { firstCommitDate: async () => null });
    provide(LastVisit, { visit: () => visit });
    inject(RepoConfig).saveRepo({ owner: "org", repo: "depot" });
    const router = createAppRouter(createMemoryHistory());
    // The root, not the view's route: its guard would load the specification, which SSK Canon's bench did not mount (`provideRouter([])`).
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
    failure = new Error("pas de comparaison dans ce test");
  });

  it("compares the last thirty days right away on the first visit, and says so", async () => {
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

  it("compares since the last visit when it is known", async () => {
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

  it("does not offer the last visit when there is none", async () => {
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

  it("switches period in one gesture", async () => {
    const f = await mountView();
    const el = await stable(f);

    [...el.querySelectorAll<HTMLButtonElement>(".periodes button")]
      .find((b) => b.textContent?.trim() === "7 jours")!
      .click();
    await stable(f);

    expect(calls.length).toBe(2);
    expect(daysBefore(calls[1].departure)).toBe(7);
  });

  it("shows free dates only on request", async () => {
    const f = await mountView();
    const el = await stable(f);
    expect(el.querySelector("form.bornes")).toBeNull();

    [...el.querySelectorAll<HTMLButtonElement>(".periodes button")]
      .find((b) => b.textContent?.includes("Choisir"))!
      .click();
    await stable(f);

    expect(el.querySelector("form.bornes")).not.toBeNull();
    // choosing dates triggers nothing until one has compared
    expect(calls.length).toBe(1);
  });

  describe("in English", () => {
    beforeEach(() => inject(LocaleService).choice.set("en"));

    it("names its periods in English", async () => {
      const el = await stable(await mountView());

      expect(el.querySelector("h1")?.textContent).toBe("What has changed");
      const labels = [...el.querySelectorAll(".periodes button")].map((b) =>
        b.textContent?.trim(),
      );
      expect(labels).toEqual([
        "7 days",
        "30 days",
        "3 months",
        "Choose dates…",
      ]);
      expect(el.querySelector(".periode-retenue")?.textContent).toContain(
        "The last 30 days",
      );
      expect(el.querySelector(".periodes")?.getAttribute("aria-label")).toBe(
        "Period",
      );
    });

    it("dates the last visit in English", async () => {
      visit = new Date("2026-09-10T08:00:00Z");
      const el = await stable(await mountView());

      const said = el.querySelector(".periode-retenue")?.textContent ?? "";
      expect(said).toContain("Since your last visit");
      expect(said).toContain("September 2026");
      expect(said).not.toContain("septembre");
    });

    it("says in English that the comparison failed", async () => {
      failure = "refusée";
      const el = await stable(await mountView());

      expect(el.querySelector(".erreur")?.textContent).toContain(
        "The comparison failed.",
      );
      expect(el.querySelector(".erreur")?.textContent).toContain("Sign in");
    });
  });
});
