import { describe, expect, it } from "vitest";
import {
  chooseSymbol,
  listSymbolCandidates,
  lireNomIdentite,
} from "./identity-names";

/**
 * RG-identite-du-projet et RG-identite-affichee : des noms fixés, trois formats
 * dans un ordre de préférence, et la variante de l'autre fond jamais employée.
 */
describe("noms de l’identité d’un projet", () => {
  const file = (path: string, size = 800) => ({
    path,
    sha: `sha-${path}`,
    size,
  });

  it("lit un nom convenu, et refuse les autres", () => {
    expect(lireNomIdentite("symbole-sombre.svg")).toEqual({
      element: "symbole",
      variante: "sombre",
      format: "svg",
    });
    expect(lireNomIdentite("logotype.png")).toEqual({
      element: "logotype",
      variante: null,
      format: "png",
    });
    expect(lireNomIdentite("symbol-clair.svg")).toBeNull();
    expect(lireNomIdentite("symbole-clair.jpg")).toBeNull();
    expect(lireNomIdentite("README.md")).toBeNull();
  });

  it("cherche la variante du thème, puis la version sans suffixe, jamais l’autre fond", () => {
    expect(listSymbolCandidates("sombre")).toEqual([
      "symbole-sombre.svg",
      "symbole-sombre.webp",
      "symbole-sombre.png",
      "symbole.svg",
      "symbole.webp",
      "symbole.png",
    ]);
    expect(
      listSymbolCandidates("clair").some((n) => n.includes("sombre")),
    ).toBe(false);
  });

  it("préfère le SVG au WebP, et le WebP au PNG", () => {
    const files = [
      file("symbole-clair.png"),
      file("symbole-clair.webp"),
      file("symbole-clair.svg"),
    ];
    expect(chooseSymbol(files, "clair")?.path).toBe("symbole-clair.svg");
    expect(chooseSymbol(files.slice(0, 2), "clair")?.path).toBe(
      "symbole-clair.webp",
    );
  });

  it("préfère la variante du thème à la version sans suffixe", () => {
    const files = [file("symbole.svg"), file("symbole-sombre.png")];
    expect(chooseSymbol(files, "sombre")?.path).toBe("symbole-sombre.png");
    expect(chooseSymbol(files, "clair")?.path).toBe("symbole.svg");
  });

  it("ne retient ni le logotype, ni la variante de l’autre fond", () => {
    const files = [file("logotype-sombre.svg"), file("symbole-clair.svg")];
    expect(chooseSymbol(files, "sombre")).toBeNull();
  });

  it("écarte un fichier au-delà de la borne de poids", () => {
    const files = [
      file("symbole.svg", 400 * 1024),
      file("symbole.png", 20 * 1024),
    ];
    expect(chooseSymbol(files, "clair")?.path).toBe("symbole.png");
  });
});
