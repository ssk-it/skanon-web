import { describe, expect, it } from "vitest";
import { themeMermaid } from "./diagram";

/**
 * The engine's theme follows the application's.
 *
 * The corrected defect: a frozen light theme left, in dark mode, dark text on dark shapes. Diagrams were displayed — bubbles without a readable label —, which is worse than an absence: nothing signalled that something was wrong.
 */
describe("diagram engine theme", () => {
  it("uses a dark theme when the application is dark", () => {
    expect(themeMermaid("sombre")).toBe("dark");
  });

  it("uses a light theme when the application is light", () => {
    expect(themeMermaid("clair")).toBe("neutral");
  });
});
