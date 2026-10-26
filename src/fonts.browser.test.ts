import { describe, expect, it } from "vitest";
import "@fontsource/roboto/400.css";
import "@fontsource/material-symbols-outlined/400.css";

/**
 * Fonts are embedded, not requested from a service: the desktop application's content security policy refuses any other host, and the application must display offline. A font file the server refuses — pnpm's global store leads outside the repo (docs/development.md) — throws no error: the icons are then displayed spelled out. Only a real engine sees it.
 */
describe("embedded fonts", () => {
  it.each([["Roboto"], ["Material Symbols Outlined"]])(
    "loads %s",
    async (family) => {
      const loaded = await document.fonts.load(`24px "${family}"`, "a");
      expect(loaded.length).toBeGreaterThan(0);
      expect(document.fonts.check(`24px "${family}"`, "a")).toBe(true);
    },
  );
});
