import { describe, expect, it } from "vitest";
import { parseDepotsCode } from "./repo-loader";

/**
 * Les dépôts de code viennent du fichier de configuration, donc d'un texte
 * écrit à la main. Le skill de cadrage s'en sert pour se situer : une entrée
 * douteuse doit être écartée et dite, jamais rendre le référentiel illisible.
 */
describe("dépôts de code déclarés par le projet", () => {
  it("rend une liste vide quand rien n’est déclaré", () => {
    expect(parseDepotsCode(undefined)).toEqual({ depots: [], anomalies: [] });
    expect(parseDepotsCode(null).depots).toEqual([]);
  });

  it("lit un dépôt avec son rôle", () => {
    const { depots, anomalies } = parseDepotsCode([
      { repo: "Wayne-Corp/wayne-front", role: "Application web" },
    ]);
    expect(depots).toEqual([
      { repo: "Wayne-Corp/wayne-front", role: "Application web" },
    ]);
    expect(anomalies).toEqual([]);
  });

  it("admet la forme courte, le rôle n’apprenant rien sur un projet à un seul dépôt", () => {
    expect(parseDepotsCode(["ssk-it/ssk-canon-pwa"]).depots).toEqual([
      { repo: "ssk-it/ssk-canon-pwa", role: "" },
    ]);
  });

  it("écarte un dépôt mal nommé, et dit lequel", () => {
    const { depots, anomalies } = parseDepotsCode([
      "sans-organisation",
      { repo: "ssk-it/ssk-canon-pwa" },
    ]);
    expect(depots).toEqual([{ repo: "ssk-it/ssk-canon-pwa", role: "" }]);
    expect(anomalies.length).toBe(1);
    expect(anomalies[0]).toContain("sans-organisation");
  });

  it("signale une valeur qui n’est pas une liste, sans rien retenir", () => {
    const { depots, anomalies } = parseDepotsCode("ssk-it/ssk-canon-pwa");
    expect(depots).toEqual([]);
    expect(anomalies.length).toBe(1);
  });
});
