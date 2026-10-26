import { describe, expect, it } from "vitest";
import { inject } from "./core/injection";
import { provideRoot } from "./startup";
import { COMPOSITION } from "./extension/composer";
import { PLATFORM } from "./platform/platform-token";
import { createWebPlatform } from "./platform/web";

/**
 * What a deliverable's composition root hands over at startup: its platform and its extensions (ADR-extensions-commerciales). The shared interface chooses neither.
 */
describe("provideRoot", () => {
  it("provides the platform and the composition of the received extensions", () => {
    const platform = createWebPlatform();
    provideRoot({
      platform,
      extensions: [
        { id: "essai", pages: { legalNotice: { host: "Un hébergeur." } } },
      ],
    });
    expect(inject(PLATFORM)).toBe(platform);
    expect(inject(COMPOSITION).legalNotice.host).toBe("Un hébergeur.");
  });

  it("refuses a wrong composition before any startup", () => {
    expect(() =>
      provideRoot({
        platform: createWebPlatform(),
        extensions: [{ id: "a" }, { id: "a" }],
      }),
    ).toThrow();
  });
});
