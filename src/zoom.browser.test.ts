import { afterEach, beforeAll, describe, expect, it } from "vitest";
import { page } from "vitest/browser";
import {
  close,
  open,
  overflows,
  PAGES,
  preloadMermaid,
} from "./accessibility-testing";

/**
 * RG-accessibilite-aa, for whoever reads large:
 *
 * - **Zoom at 200 %** (1.4.4): enlarging the page twice amounts, for its layout, to a window twice as narrow in CSS pixels — 640 px for a 1280 screen.
 * - **Forced text spacing** (1.4.12): line height at 1.5, paragraphs spaced by twice the text size, letters by 0.12 em, words by 0.16 em, as a user style sheet would.
 *
 * In both cases, nothing must leave the page, and no text must be clipped by the box that holds it.
 */
afterEach(close);

beforeAll(preloadMermaid, 60_000);

/** Visible to the eye: neither hidden, nor transparent, nor in a parent that is. */
function readable(el: Element): boolean {
  if (getComputedStyle(el).visibility === "hidden") return false;
  for (let n: Element | null = el; n; n = n.parentElement)
    if (getComputedStyle(n).opacity === "0") return false;
  return true;
}

/**
 * The boxes that cut their content: they hide it (`overflow` other than `visible`, without possible scrolling) while it exceeds them. A text truncated by an ellipsis remains a loss — unless its whole can be read elsewhere, in a `title` the screen reader also announces.
 */
function clipped(): string[] {
  return [...document.querySelectorAll<HTMLElement>("body *")]
    .filter((el) => {
      if (!el.getClientRects().length || !(el.textContent ?? "").trim())
        return false;
      // What is not read: an icon, whose ligature is not text, or a field's invisible notch.
      if (el.closest("[aria-hidden='true']") || !readable(el)) return false;
      const style = getComputedStyle(el);
      const cutsX = ["hidden", "clip"].includes(style.overflowX);
      const cutsY = ["hidden", "clip"].includes(style.overflowY);
      const exceeds =
        (cutsX && el.scrollWidth > el.clientWidth + 1) ||
        (cutsY && el.scrollHeight > el.clientHeight + 1);
      if (!exceeds) return false;
      // Hidden from the eye on purpose, for the screen reader alone: nothing is lost there.
      if (el.clientWidth <= 1 && el.clientHeight <= 1) return false;
      return !el.closest("[title]");
    })
    .map(
      (el) =>
        `${el.tagName.toLowerCase()}${[...el.classList].map((c) => `.${c}`).join("")} « ${(el.textContent ?? "").trim().slice(0, 30)} »`,
    );
}

describe("zoom at 200 % — RG-accessibilite-aa", () => {
  beforeAll(async () => {
    await page.viewport(640, 400);
  });

  it.each(PAGES)(
    "%s: nothing overflows, no text is clipped",
    async (address) => {
      await open(address);
      expect(overflows()).toEqual([]);
      expect(clipped()).toEqual([]);
    },
    30_000,
  );
});

describe("forced text spacing — RG-accessibilite-aa", () => {
  beforeAll(async () => {
    await page.viewport(1280, 800);
  });

  it.each(PAGES)(
    "%s: no text is clipped",
    async (address) => {
      await open(address);
      const spacing = document.createElement("style");
      spacing.textContent = `
        * { line-height: 1.5 !important; letter-spacing: 0.12em !important; word-spacing: 0.16em !important; }
        p { margin-bottom: 2em !important; }`;
      document.head.append(spacing);
      try {
        expect(overflows()).toEqual([]);
        expect(clipped()).toEqual([]);
      } finally {
        spacing.remove();
      }
    },
    30_000,
  );
});
