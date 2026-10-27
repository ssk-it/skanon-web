import { flushPromises, mount, type VueWrapper } from "@vue/test-utils";
import axe from "axe-core";
import { IDBFactory } from "fake-indexeddb";
import { createMemoryHistory } from "vue-router";
import "@fontsource/roboto/400.css";
import "@fontsource/material-symbols-outlined/400.css";
import App from "./App.vue";
import {
  provideHttpTesting,
  type HttpTestingController,
} from "./core/http/http-testing";
import { provide, resetInjection } from "./core/injection";
import { INDEXEDDB_FACTORY } from "./core/repo/content-cache";
import { loadTestSpecification } from "./features/test-specification";
import { createAppRouter } from "./router";
import "./styles.css";

/**
 * What the accessibility tests in the browser share: the pages checked, the whole application mounted, and axe's reading — RG-accessibilite-aa.
 */
export const PAGES = [
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

export const CRITERIA = [
  "wcag2a",
  "wcag2aa",
  "wcag21a",
  "wcag21aa",
  "wcag22aa",
];

let mounted: VueWrapper | undefined;

/** Unmounts the application and empties the injection: to call after each test. */
export function close(): void {
  mounted?.unmount();
  mounted = undefined;
  resetInjection();
  delete document.documentElement.dataset["theme"];
}

/** Mermaid weighs several megabytes, and the test domain's diagram loads it: loading it beforehand leaves the tests their own timeout. */
export async function preloadMermaid(): Promise<void> {
  await import("mermaid");
}

/** Mounts the whole application at `address`, with the test specification loaded for a project page. */
export async function open(
  address: string,
  before?: (http: HttpTestingController) => void | Promise<void>,
): Promise<HTMLElement> {
  const http = provideHttpTesting();
  // The engine's IndexedDB survives from one test to the next: content kept by the first would no longer be requested by the following one.
  provide(INDEXEDDB_FACTORY, new IDBFactory());
  if (address.startsWith("/test/test/")) await loadTestSpecification(http);
  // After loading: a token set before would have the specification read by another path than the one the test specification serves.
  await before?.(http);
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
export async function violations(root: HTMLElement): Promise<string[]> {
  const result = await axe.run(root, {
    runOnly: { type: "tag", values: CRITERIA },
  });
  return result.violations.map(
    (v) =>
      `${v.id} — ${v.help}: ${v.nodes.map((n) => `${n.target.join(" ")} (${n.failureSummary?.replace(/\s+/g, " ") ?? ""})`).join(", ")}`,
  );
}

/**
 * The elements wider than the page, named by their tag and classes. A code block or a wide table scrolls in its own frame, which 1.4.10 allows: what it contains does not count.
 */
export function overflows(): string[] {
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
