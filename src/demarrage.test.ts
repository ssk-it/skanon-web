import { describe, expect, it } from "vitest";
import { inject } from "./core/injection";
import { fournirLaRacine } from "./demarrage";
import { COMPOSITION } from "./extension/composer";
import { PLATEFORME } from "./plateforme/jeton";
import { createPlateformeWeb } from "./plateforme/web";

/**
 * Ce que la racine de composition d'un livrable remet au démarrage : sa plateforme et ses extensions (ADR-extensions-commerciales). L'interface commune ne choisit ni l'une ni les autres.
 */
describe("fournirLaRacine", () => {
  it("fournit la plateforme et la composition des extensions reçues", () => {
    const plateforme = createPlateformeWeb();
    fournirLaRacine({
      plateforme,
      extensions: [
        { id: "essai", pages: { mentions: { hebergeur: "Un hébergeur." } } },
      ],
    });
    expect(inject(PLATEFORME)).toBe(plateforme);
    expect(inject(COMPOSITION).mentions.hebergeur).toBe("Un hébergeur.");
  });

  it("refuse une composition fausse avant tout démarrage", () => {
    expect(() =>
      fournirLaRacine({
        plateforme: createPlateformeWeb(),
        extensions: [{ id: "a" }, { id: "a" }],
      }),
    ).toThrow();
  });
});
