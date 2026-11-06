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
import { LocaleService } from "./core/i18n/locale.service";
import { inject, provide } from "./core/injection";
import { COMPOSITION, compose } from "./extension/composer";
import type { Extension } from "./extension/extension";

/**
 * RG-accessibilite-aa, for the two places an extension fills on a feature (scoping 2026-069): the shared interface gives them their form, and answers for it whatever the extension writes there. A fake extension fills them, as the composition root of a deliverable would.
 */
const FAKE: Extension = {
  id: "factice",
  pages: {
    featureSections: [
      {
        id: "section-factice",
        heading: { fr: "Palier", en: "Tier" },
        notes: (f) => [
          { text: { fr: `${f.name} est au palier haut.`, en: "High tier." } },
          {
            icon: "warning_amber",
            text: { fr: "Une valeur non reconnue.", en: "An unknown value." },
          },
        ],
      },
    ],
    featureFilters: [
      {
        id: "filtre-factice",
        label: { fr: "Palier", en: "Tier" },
        options: [
          {
            id: "relance",
            label: { fr: "Relance seule", en: "Reminders only" },
            matches: (f) => f.id === "relance",
          },
        ],
      },
    ],
  },
};

async function openWithFake(address: string): Promise<HTMLElement> {
  return open(address, () => {
    provide(COMPOSITION, compose([FAKE]));
    // The engine's language differs from one machine to the next: the texts checked here are French.
    inject(LocaleService).choice.set("fr");
  });
}

async function chooseFirstOption(root: HTMLElement): Promise<HTMLElement> {
  const combobox = root.querySelector<HTMLElement>(
    '.filtres [role="combobox"]',
  )!;
  combobox.focus();
  combobox.dispatchEvent(
    new KeyboardEvent("keydown", { key: "ArrowDown", bubbles: true }),
  );
  await flushPromises();
  return combobox;
}

afterEach(() => {
  // The choice is kept in storage: the files that follow read the engine's language again.
  inject(LocaleService).choice.set("browser");
  close();
});

beforeAll(async () => {
  await preloadMermaid();
  await page.viewport(1280, 800);
}, 60_000);

describe.each([["clair"], ["sombre"]])(
  "the contributed feature places, theme %s — RG-accessibilite-aa",
  (theme) => {
    it("the feature page and its section have no violation axe can see", async () => {
      document.documentElement.dataset["theme"] = theme;
      const root = await openWithFake(
        "/test/test/referentiel/fonctionnalite/relance",
      );
      expect(
        root.querySelector('[data-apport="section-factice"]'),
      ).not.toBeNull();
      expect(await violations(root)).toEqual([]);
    }, 30_000);

    it("the overview and its filter, applied, have no violation axe can see", async () => {
      document.documentElement.dataset["theme"] = theme;
      const root = await openWithFake("/test/test/referentiel");
      await chooseFirstOption(root);
      expect(root.querySelector('.filtres [role="status"]')?.textContent).toBe(
        "1 fonctionnalité sur 1",
      );
      expect(await violations(root)).toEqual([]);
    }, 30_000);
  },
);

describe("the contributed feature places at 320 px — RG-accessibilite-aa", () => {
  beforeAll(async () => {
    await page.viewport(320, 640);
  });

  it.each([
    "/test/test/referentiel",
    "/test/test/referentiel/fonctionnalite/relance",
  ])(
    "%s does not scroll sideways",
    async (address) => {
      await openWithFake(address);
      expect(overflows()).toEqual([]);
    },
    30_000,
  );
});

describe("the contributed filter by keyboard — RG-accessibilite-aa", () => {
  it("is reached by Tab, and changes the list with the arrow keys", async () => {
    const root = await openWithFake("/test/test/referentiel");
    const combobox = root.querySelector<HTMLElement>(
      '.filtres [role="combobox"]',
    )!;
    expect(combobox.tabIndex).toBe(0);
    await chooseFirstOption(root);
    expect(combobox.textContent).toContain("Relance seule");
    expect(document.activeElement).toBe(combobox);
  }, 30_000);
});
