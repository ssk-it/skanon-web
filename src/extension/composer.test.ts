import { describe, expect, it } from "vitest";
import { inject } from "../core/injection";
import { COMPOSITION, composer } from "./composer";
import type { ActionDeBarre, Extension } from "./extension";

function action(id: string, rang?: number): ActionDeBarre {
  return {
    id,
    rang,
    icone: () => "key",
    libelle: id,
    titre: () => id,
    activer: () => {},
  };
}

/**
 * La composition des extensions d'un livrable — ADR-extensions-commerciales. Une composition fausse échoue ici, au premier test, et non chez l'utilisateur.
 */
describe("composer", () => {
  it("ne compose rien sans extension : c'est la composition des tests", () => {
    expect(inject(COMPOSITION)).toEqual(composer([]));
    expect(composer([])).toEqual({
      actionsDeBarre: [],
      bandeaux: [],
      aide: { jetons: [], cache: [], communications: [] },
      mentions: { hebergeur: null, donnees: [], propriete: [] },
    });
  });

  it("rassemble les apports de chaque extension, point par point", () => {
    const a: Extension = {
      id: "a",
      coquille: {
        actionsDeBarre: [action("a1")],
        bandeaux: [
          { id: "a-bandeau", icone: "info", texte: () => "Un bandeau." },
        ],
      },
      pages: {
        aide: { jetons: ["Une phrase de a."] },
        mentions: { hebergeur: "Aucun.", donnees: ["Donnée de a."] },
      },
    };
    const b: Extension = {
      id: "b",
      pages: {
        aide: { jetons: ["Une phrase de b."], communications: ["Un hôte."] },
        mentions: { propriete: ["Licence de b."] },
      },
    };
    const composition = composer([a, b]);
    expect(composition.actionsDeBarre.map((x) => x.id)).toEqual(["a1"]);
    expect(composition.bandeaux.map((x) => x.id)).toEqual(["a-bandeau"]);
    expect(composition.aide).toEqual({
      jetons: ["Une phrase de a.", "Une phrase de b."],
      cache: [],
      communications: ["Un hôte."],
    });
    expect(composition.mentions).toEqual({
      hebergeur: "Aucun.",
      donnees: ["Donnée de a."],
      propriete: ["Licence de b."],
    });
  });

  it("range les apports d'un point par rang, puis dans l'ordre de composition", () => {
    const composition = composer([
      {
        id: "a",
        coquille: { actionsDeBarre: [action("a1"), action("a2", -1)] },
      },
      { id: "b", coquille: { actionsDeBarre: [action("b1", -1)] } },
    ]);
    expect(composition.actionsDeBarre.map((x) => x.id)).toEqual([
      "a2",
      "b1",
      "a1",
    ]);
  });

  it("refuse deux extensions de même identifiant", () => {
    expect(() => composer([{ id: "a" }, { id: "a" }])).toThrow(/a/);
  });

  it("refuse deux apports de même identifiant sur un point", () => {
    expect(() =>
      composer([
        { id: "a", coquille: { actionsDeBarre: [action("x")] } },
        { id: "b", coquille: { actionsDeBarre: [action("x")] } },
      ]),
    ).toThrow(/x/);
  });

  it("refuse deux hébergeurs : un livrable n'est servi que par un", () => {
    expect(() =>
      composer([
        { id: "a", pages: { mentions: { hebergeur: "Un." } } },
        { id: "b", pages: { mentions: { hebergeur: "Deux." } } },
      ]),
    ).toThrow(/hébergeur/);
  });
});
