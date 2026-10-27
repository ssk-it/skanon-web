import { flushPromises, mount, type VueWrapper } from "@vue/test-utils";
import axe from "axe-core";
import { IDBFactory } from "fake-indexeddb";
import { afterEach, beforeAll, describe, expect, it } from "vitest";
import { page } from "vitest/browser";
import { createMemoryHistory } from "vue-router";
import "@fontsource/roboto/400.css";
import "@fontsource/material-symbols-outlined/400.css";
import App from "./App.vue";
import { provideHttpTesting } from "./core/http/http-testing";
import { provide, resetInjection } from "./core/injection";
import { INDEXEDDB_FACTORY } from "./core/repo/content-cache";
import { loadTestSpecification } from "./features/test-specification";
import { createAppRouter } from "./router";
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
      `${v.id} — ${v.help}: ${v.nodes.map((n) => n.target.join(" ")).join(", ")}`,
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
