import { describe, expect, it } from "vitest";
import {
  chooseSymbol,
  listSymbolCandidates,
  lireNomIdentite,
} from "./identity-names";

/**
 * RG-identite-du-projet and RG-identite-affichee: fixed names, three formats
 * in an order of preference, and the other background's variant never used.
 */
describe("names of a project's identity", () => {
  const file = (path: string, size = 800) => ({
    path,
    sha: `sha-${path}`,
    size,
  });

  it("reads an agreed name, and refuses the others", () => {
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

  it("looks for the theme's variant, then the unsuffixed version, never the other background", () => {
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

  it("prefers SVG to WebP, and WebP to PNG", () => {
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

  it("prefers the theme's variant to the unsuffixed version", () => {
    const files = [file("symbole.svg"), file("symbole-sombre.png")];
    expect(chooseSymbol(files, "sombre")?.path).toBe("symbole-sombre.png");
    expect(chooseSymbol(files, "clair")?.path).toBe("symbole.svg");
  });

  it("keeps neither the logotype nor the other background's variant", () => {
    const files = [file("logotype-sombre.svg"), file("symbole-clair.svg")];
    expect(chooseSymbol(files, "sombre")).toBeNull();
  });

  it("sets aside a file beyond the weight limit", () => {
    const files = [
      file("symbole.svg", 400 * 1024),
      file("symbole.png", 20 * 1024),
    ];
    expect(chooseSymbol(files, "clair")?.path).toBe("symbole.png");
  });
});
