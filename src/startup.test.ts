import { describe, expect, it } from "vitest";
import { inject } from "./core/injection";
import { provideRoot } from "./startup";
import { COMPOSITION } from "./extension/composer";
import { PLATFORM } from "./platform/platform-token";
import { createWebPlatform } from "./platform/web";

/**
 * Ce que la racine de composition d'un livrable remet au démarrage : sa plateforme et ses extensions (ADR-extensions-commerciales). L'interface commune ne choisit ni l'une ni les autres.
 */
describe("fournirLaRacine", () => {
  it("fournit la plateforme et la composition des extensions reçues", () => {
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

  it("refuse une composition fausse avant tout démarrage", () => {
    expect(() =>
      provideRoot({
        platform: createWebPlatform(),
        extensions: [{ id: "a" }, { id: "a" }],
      }),
    ).toThrow();
  });
});
