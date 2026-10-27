import { flushPromises, mount, type VueWrapper } from "@vue/test-utils";
import axe from "axe-core";
import { IDBFactory } from "fake-indexeddb";
import { afterEach, beforeAll, describe, expect, it } from "vitest";
import { page } from "vitest/browser";
import type { Component } from "vue";
import { createMemoryHistory } from "vue-router";
import "@fontsource/roboto/400.css";
import "@fontsource/material-symbols-outlined/400.css";
import App from "./App.vue";
import { provideHttpTesting } from "./core/http/http-testing";
import { inject, provide, resetInjection } from "./core/injection";
import { INDEXEDDB_FACTORY } from "./core/repo/content-cache";
import { loadTestSpecification } from "./features/test-specification";
import { createAppRouter } from "./router";
import ConfirmationDialog from "./features/shared/ConfirmationDialog.vue";
import LinkDialog from "./features/shared/LinkDialog.vue";
import RepoDialog from "./features/shared/RepoDialog.vue";
import TokenDialog from "./features/shared/TokenDialog.vue";
import SearchPalette from "./features/search/SearchPalette.vue";
import { DialogService, type DialogOptions } from "./ui/dialog.service";
import "./styles.css";

/**
 * RG-accessibilite-aa, in a real engine: each page, shell included, run through axe-core against the A and AA criteria of WCAG 2.2, in both themes — contrast is measured there on the rendered page, not on the tokens (2026-028, decision 02) —, then narrowed to 320 px wide (1.4.10).
 *
 * axe does not see everything: neither focus order, nor what a screen reader announces, nor the meaning of a text alternative. What it sees, it sees on every page, at every change.
 */
const PAGES = [
  "/",
  "/aide",
  "/mentions-legales",
  "/test/test/referentiel",
  "/test/test/referentiel/domaine/facturation",
  "/test/test/referentiel/fonctionnalite/relance",
  "/test/test/referentiel/regle/RG-limite",
  "/test/test/cadrages",
  "/test/test/cadrages/2026-001",
  "/test/test/cadrages/nouveau",
  "/test/test/cadrages/2026-001/editer",
  "/test/test/architecture",
  "/test/test/evolution",
  "/test/test/reglages",
];

const CRITERIA = ["wcag2a", "wcag2aa", "wcag21a", "wcag21aa", "wcag22aa"];

let mounted: VueWrapper | undefined;

afterEach(() => {
  mounted?.unmount();
  mounted = undefined;
  resetInjection();
  delete document.documentElement.dataset["theme"];
});

// Mermaid weighs several megabytes, and the test domain's diagram loads it: loading it beforehand leaves the tests their own timeout.
beforeAll(async () => {
  await import("mermaid");
}, 60_000);

/** Mounts the whole application at `address`, with the test specification loaded for a project page. */
async function open(address: string): Promise<HTMLElement> {
  const http = provideHttpTesting();
  // The engine's IndexedDB survives from one test to the next: content kept by the first would no longer be requested by the following one.
  provide(INDEXEDDB_FACTORY, new IDBFactory());
  if (address.startsWith("/test/test/")) await loadTestSpecification(http);
  const router = createAppRouter(createMemoryHistory());
  await router.push(address);
  await router.isReady();
  mounted = mount(App, {
    global: { plugins: [router] },
    attachTo: document.body,
  });
  await flushPromises();
  await new Promise((r) => setTimeout(r, 300));
  await flushPromises();
  return document.body;
}

/** axe's violations, one per rule, with the elements that carry them. */
async function violations(root: HTMLElement): Promise<string[]> {
  const result = await axe.run(root, {
    runOnly: { type: "tag", values: CRITERIA },
  });
  return result.violations.map(
    (v) =>
      `${v.id} — ${v.help}: ${v.nodes.map((n) => `${n.target.join(" ")} (${n.failureSummary?.replace(/\s+/g, " ") ?? ""})`).join(", ")}`,
  );
}

describe("pages against WCAG 2.2 AA — RG-accessibilite-aa", () => {
  describe.each([["clair"], ["sombre"]])("theme %s", (theme) => {
    it.each(PAGES)(
      "%s has no violation axe can see",
      async (address) => {
        document.documentElement.dataset["theme"] = theme;
        const root = await open(address);
        expect(await violations(root)).toEqual([]);
      },
      30_000,
    );
  });
});

/**
 * The elements wider than the page, named by their tag and classes. A code block or a wide table scrolls in its own frame, which 1.4.10 allows: what it contains does not count.
 */
function overflows(): string[] {
  const width = document.documentElement.clientWidth;
  const scrolls = (el: Element | null): boolean =>
    !!el &&
    el !== document.documentElement &&
    (["auto", "scroll"].includes(getComputedStyle(el).overflowX) ||
      scrolls(el.parentElement));
  return [...document.body.querySelectorAll("*")]
    .filter((el) => el.getBoundingClientRect().right > width + 0.5)
    .filter((el) => !scrolls(el.parentElement))
    .map(
      (el) =>
        `${el.tagName.toLowerCase()}${[...el.classList].map((c) => `.${c}`).join("")} — ${Math.round(el.getBoundingClientRect().right)} px`,
    );
}

/**
 * The dialogs, opened over a project page as the application opens them.
 */
const DIALOGS: [string, Component, DialogOptions<unknown>][] = [
  ["token", TokenDialog, {}],
  ["repo", RepoDialog, { focus: "dialogue" }],
  ["link", LinkDialog, { focus: "dialogue", data: null }],
  [
    "confirmation",
    ConfirmationDialog,
    {
      focus: "dialogue",
      data: {
        title: "Supprimer ce lien ?",
        message: "Il ne sera plus rattaché.",
        action: "Supprimer",
      },
    },
  ],
  [
    "search",
    SearchPalette,
    {
      data: { onPastState: false },
      width: "640px",
      className: "palette-recherche",
      label: "Rechercher dans le référentiel",
    },
  ],
];

describe("dialogs against WCAG 2.2 AA — RG-accessibilite-aa", () => {
  describe.each([["clair"], ["sombre"]])("theme %s", (theme) => {
    it.each(DIALOGS)(
      "the %s dialog has no violation axe can see",
      async (_name, component, options) => {
        document.documentElement.dataset["theme"] = theme;
        const root = await open("/test/test/cadrages/2026-001");
        void inject(DialogService).open(component, options);
        await flushPromises();
        await new Promise((r) => setTimeout(r, 300));
        expect(document.querySelector("[role='dialog']")).not.toBeNull();
        expect(await violations(root)).toEqual([]);
        inject(DialogService).closeAll();
      },
      30_000,
    );
  });
});

describe("search with results — RG-accessibilite-aa", () => {
  it("has no violation axe can see, a query typed", async () => {
    const root = await open("/test/test/cadrages/2026-001");
    void inject(DialogService).open(SearchPalette, {
      data: { onPastState: false },
      label: "Rechercher dans le référentiel",
    });
    await flushPromises();
    const field = document.querySelector<HTMLInputElement>(
      "input[type='search']",
    );
    if (!field) throw new Error("Search field not found");
    field.value = "relance";
    field.dispatchEvent(new Event("input"));
    await new Promise((r) => setTimeout(r, 500));
    await flushPromises();
    expect(document.querySelectorAll("[role='option']").length).toBeGreaterThan(
      0,
    );
    expect(await violations(root)).toEqual([]);
    inject(DialogService).closeAll();
  }, 30_000);
});

describe("reflow at 320 px — RG-accessibilite-aa", () => {
  beforeAll(async () => {
    await page.viewport(320, 640);
  });

  it.each(PAGES)(
    "%s fits the width, without horizontal scrolling",
    async (address) => {
      await open(address);
      expect(overflows()).toEqual([]);
    },
    30_000,
  );
});

/**
 * The top bar stays stuck to the top of the screen: an element that takes focus while going back up the page must not end up under it (2.4.11). We go down to the bottom of the page, then give focus to each focusable element of the content, from the last to the first, as Shift+Tab would.
 */
function hidden(): string[] {
  const bar = document.querySelector(".barre");
  if (!bar) throw new Error("Bar not found");
  const focusables = [
    ...document.querySelectorAll<HTMLElement>(
      "main a[href], main :is(button, input, textarea, select):not([disabled]), main [tabindex]:not([tabindex='-1'])",
    ),
  ].filter((el) => el.getClientRects().length > 0);
  window.scrollTo(0, document.documentElement.scrollHeight);
  return focusables
    .reverse()
    .filter((el) => {
      el.focus();
      return (
        el.getBoundingClientRect().top <
        bar.getBoundingClientRect().bottom - 0.5
      );
    })
    .map(
      (el) =>
        `${el.tagName.toLowerCase()}${[...el.classList].map((c) => `.${c}`).join("")} « ${(el.textContent ?? "").trim().slice(0, 30)} »`,
    );
}

describe.each([
  [1280, 720],
  [800, 600],
  [375, 640],
])(
  "focus never hidden by the bar, at %i px — RG-accessibilite-aa",
  (width, height) => {
    beforeAll(async () => {
      await page.viewport(width, height);
    });

    it.each(PAGES)(
      "%s",
      async (address) => {
        await open(address);
        expect(hidden()).toEqual([]);
      },
      30_000,
    );
  },
);
