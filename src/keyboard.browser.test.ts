import { flushPromises } from "@vue/test-utils";
import { afterEach, beforeAll, describe, expect, it } from "vitest";
import { page } from "vitest/browser";
import { close, open, PAGES, preloadMermaid } from "./accessibility-testing";

/**
 * RG-accessibilite-aa, by keyboard alone, on each page:
 *
 * - **Everything is reached** (2.1.1): nothing clickable — an element with a link cursor, or carrying a command role — escapes Tab.
 * - **In document order** (2.4.3): no positive `tabindex` reorders the traversal.
 * - **Focus is visible** (2.4.7): each reachable element changes appearance on focus — outline, shadow, background, or a button's state layer.
 *
 * The traversal is not done with real keystrokes: headless WebKit, like Safari by default, does not move focus to links on Tab, and never considers the document active. The test therefore reads what decides the traversal — what is focusable, and in what order — rather than replaying it.
 */
afterEach(close);

beforeAll(async () => {
  await preloadMermaid();
  await page.viewport(1280, 800);
}, 60_000);

const TABBABLE = [
  "a[href]",
  "button:not([disabled])",
  "input:not([disabled]):not([type='hidden'])",
  "select:not([disabled])",
  "textarea:not([disabled])",
  "summary",
  "[tabindex]:not([tabindex='-1'])",
].join(", ");

/** What a Tab must reach: visible, outside an inert subtree, and a single box per group of radio buttons — the checked one, or the first. */
function expected(): HTMLElement[] {
  const radiosSeen = new Set<string>();
  return [...document.querySelectorAll<HTMLElement>(TABBABLE)].filter((el) => {
    if (!el.getClientRects().length) return false;
    if (getComputedStyle(el).visibility === "hidden") return false;
    if (el.closest("[inert], [aria-hidden='true']")) return false;
    if (el instanceof HTMLInputElement && el.type === "radio") {
      const group = el.name;
      const checked = document.querySelector<HTMLInputElement>(
        `input[type='radio'][name='${group}']:checked`,
      );
      if (checked ? checked !== el : radiosSeen.has(group)) return false;
      radiosSeen.add(group);
    }
    return true;
  });
}

/** The appearance an element takes from its focus: its own, and that of its pseudo-elements, where Material's state layer lives. */
function appearance(el: Element): string {
  const PROPERTIES = [
    "outline-style",
    "outline-width",
    "outline-color",
    "box-shadow",
    "background-color",
    "border-color",
    "text-decoration-line",
    "opacity",
  ];
  return [null, "::before", "::after"]
    .map((pseudo) => {
      const style = getComputedStyle(el, pseudo);
      return PROPERTIES.map((p) => style.getPropertyValue(p)).join("|");
    })
    .join("‖");
}

/** The appearance of a whole area: the element and everything it contains. */
function appearanceOf(area: Element): string {
  return [area, ...area.querySelectorAll("*")].map(appearance).join("¶");
}

function describeElement(el: Element | null): string {
  if (!el) return "(nothing)";
  const name =
    el.getAttribute("aria-label") ?? (el.textContent ?? "").trim().slice(0, 30);
  return `${el.tagName.toLowerCase()}${[...el.classList].map((c) => `.${c}`).join("")} « ${name} »`;
}

/**
 * Headless WebKit never considers the document active: it moves focus there, but matches neither `:focus` nor `:focus-visible`. Each rule that uses them therefore gets a second selector, `[data-focus]` — `:has([data-focus])` for `:focus-within` —, which the test sets on the element reached: that is the appearance the style sheet gives it on focus, no more, no less. Transitions are turned off, to read the final state and not its start.
 */
function replayFocus(): void {
  const rewrite = (rules: CSSRuleList): void => {
    for (const rule of rules) {
      if (
        rule instanceof CSSStyleRule &&
        /:focus(?![-\w])|:focus-visible|:focus-within/.test(rule.selectorText)
      )
        rule.selectorText = `${rule.selectorText}, ${rule.selectorText.replace(/:focus(-visible)?(?![-\w])/g, "[data-focus]").replace(/:focus-within/g, ":has([data-focus])")}`;
      if ("cssRules" in rule) rewrite((rule as CSSGroupingRule).cssRules);
    }
  };
  for (const sheet of document.styleSheets) {
    try {
      rewrite(sheet.cssRules);
    } catch {
      /* a sheet from another origin: nothing of the application */
    }
  }
  // The outline the browser gives on its own on focus comes from its internal sheet, which nothing here reads: it is replayed at the bottom of the cascade (`:where`, before any sheet), so that an application rule removing it wins as it does for real.
  const byDefault = document.createElement("style");
  byDefault.textContent = ":where([data-focus]) { outline: auto 1px; }";
  document.head.prepend(byDefault);
  const noTransition = document.createElement("style");
  noTransition.textContent =
    "*, *::before, *::after { transition: none !important; }";
  document.head.append(noTransition);
}

/** What one clicks and should therefore be reached by keyboard: a link cursor, or a command role. */
function clickables(): HTMLElement[] {
  const ROLES =
    "[role='button'], [role='link'], [role='tab'], [role='menuitem'], [role='option'], [role='checkbox'], [role='switch']";
  return [...document.querySelectorAll<HTMLElement>("body *")].filter(
    (el) =>
      el.getClientRects().length > 0 &&
      !el.closest("[inert], [aria-hidden='true']") &&
      (el.matches(ROLES) || getComputedStyle(el).cursor === "pointer") &&
      // The cursor is inherited: only the element that sets it counts, not its children.
      getComputedStyle(el.parentElement ?? document.body).cursor !== "pointer",
  );
}

describe("keyboard traversal — RG-accessibilite-aa", () => {
  it.each(PAGES)(
    "%s: everything is reached, in document order, with a visible focus",
    async (address) => {
      await open(address);
      replayFocus();
      const tabbables = expected();

      // Everything is reached: a clickable element is focusable, or contains or lies within what is (a label around its box).
      const outOfReach = clickables().filter(
        (el) =>
          !tabbables.some(
            (t) => t === el || el.contains(t) || t.contains(el),
          ) && !el.closest("label")?.querySelector("input"),
      );
      expect(outOfReach.map(describeElement)).toEqual([]);

      // In document order.
      expect(
        [...document.querySelectorAll<HTMLElement>("[tabindex]")]
          .filter((el) => el.tabIndex > 0)
          .map(describeElement),
      ).toEqual([]);

      // Focus is visible.
      const invisible: HTMLElement[] = [];
      for (const el of tabbables) {
        // A kit field draws its focus on its frame, through a class set on the `focus` event: the whole frame is compared.
        const area =
          el.closest<HTMLElement>(".ui-champ, .ui-case, label") ?? el;
        const atRest = appearanceOf(area);
        el.setAttribute("data-focus", "");
        el.focus();
        await flushPromises();
        const onFocus = appearanceOf(area);
        el.blur();
        el.removeAttribute("data-focus");
        await flushPromises();
        if (atRest === onFocus) invisible.push(el);
      }
      expect(invisible.map(describeElement)).toEqual([]);
    },
    30_000,
  );
});
