import { describe, expect, it } from "vitest";
import { parseCodeRepos } from "./repo-loader";

/**
 * Les dépôts de code viennent du fichier de configuration, donc d'un texte
 * écrit à la main. Le skill de cadrage s'en sert pour se situer : une entrée
 * douteuse doit être écartée et dite, jamais rendre le référentiel illisible.
 */
describe("dépôts de code déclarés par le projet", () => {
  it("rend une liste vide quand rien n’est déclaré", () => {
    expect(parseCodeRepos(undefined)).toEqual({ repos: [], anomalies: [] });
    expect(parseCodeRepos(null).repos).toEqual([]);
  });

  it("lit un dépôt avec son rôle", () => {
    const { repos, anomalies } = parseCodeRepos([
      { repo: "Wayne-Corp/wayne-front", role: "Application web" },
    ]);
    expect(repos).toEqual([
      { repo: "Wayne-Corp/wayne-front", role: "Application web" },
    ]);
    expect(anomalies).toEqual([]);
  });

  it("admet la forme courte, le rôle n’apprenant rien sur un projet à un seul dépôt", () => {
    expect(parseCodeRepos(["ssk-it/ssk-canon-pwa"]).repos).toEqual([
      { repo: "ssk-it/ssk-canon-pwa", role: "" },
    ]);
  });

  it("écarte un dépôt mal nommé, et dit lequel", () => {
    const { repos, anomalies } = parseCodeRepos([
      "sans-organisation",
      { repo: "ssk-it/ssk-canon-pwa" },
    ]);
    expect(repos).toEqual([{ repo: "ssk-it/ssk-canon-pwa", role: "" }]);
    expect(anomalies.length).toBe(1);
    expect(anomalies[0]).toContain("sans-organisation");
  });

  it("signale une valeur qui n’est pas une liste, sans rien retenir", () => {
    const { repos, anomalies } = parseCodeRepos("ssk-it/ssk-canon-pwa");
    expect(repos).toEqual([]);
    expect(anomalies.length).toBe(1);
  });
});
