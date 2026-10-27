import { afterEach, describe, expect, it } from "vitest";
import { page } from "vitest/browser";
import { close, open } from "./accessibility-testing";
import { provide } from "./core/injection";
import { PLATFORM } from "./platform/platform-token";
import { createWebPlatform } from "./platform/web";

/**
 * The window's controls drawn over the bar, in a real engine: the room left for them must hold where the bar is narrowest, without sending a button alone to a second line (RG-aide-a-portee), without the brand losing its symbol (RG-identite-affichee), and without the skip link's focus ending up under them (RG-accessibilite-aa, 2.4.11).
 */
afterEach(close);

/** What macOS's controls take from the window's left edge, as the desktop application announces it. */
const CONTROLS = 72;

async function openWithControls(address: string): Promise<void> {
  await open(address, () => {
    provide(PLATFORM, {
      ...createWebPlatform(),
      target: "bureau",
      titleBar: {
        listenControlsWidth: (onWidth) => {
          onWidth(CONTROLS);
          return () => {};
        },
        makeDraggable: () => () => {},
      },
    });
  });
}

function box(selector: string): DOMRect {
  const el = document.querySelector(selector);
  if (!el) throw new Error(`${selector} not found`);
  return el.getBoundingClientRect();
}

describe.each([[1280], [1080], [801], [800], [760], [721], [720]])(
  "controls over the bar, at %i px",
  (width) => {
    it.each([["/"], ["/test/test/referentiel"]])(
      "%s keeps the logo clear of them, and the bar's buttons on one line",
      async (address) => {
        await page.viewport(width, 720);
        await openWithControls(address);

        expect(box(".marque .logo").left).toBeGreaterThanOrEqual(CONTROLS + 8);
        // Given way to the eye, the name stays the brand link's name for the screen reader.
        expect(document.querySelector(".marque")?.textContent).toContain(
          "Skanon",
        );
        // On the brand's line: the tabs alone may take their own, below 1080 px.
        const brand = box(".marque");
        const offTheLine = [
          ...document.querySelectorAll(".barre > .ui-bouton, .barre > a"),
        ]
          .filter((el) => el.getClientRects().length > 0)
          .filter((el) => {
            const b = el.getBoundingClientRect();
            const middle = b.top + b.height / 2;
            return middle < brand.top || middle > brand.bottom;
          })
          .map((el) => el.getAttribute("aria-label") ?? el.textContent);
        expect(offTheLine).toEqual([]);
      },
      30_000,
    );
  },
);

it("shows the skip link clear of the controls when it takes focus", async () => {
  await page.viewport(1280, 720);
  await openWithControls("/");
  document.querySelector<HTMLElement>(".evitement")!.focus();
  expect(box(".evitement").left).toBeGreaterThanOrEqual(CONTROLS);
});
