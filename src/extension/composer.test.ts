import { describe, expect, it } from "vitest";
import { inject } from "../core/injection";
import { COMPOSITION, compose } from "./composer";
import type { ToolbarAction, Extension } from "./extension";

function action(id: string, rank?: number): ToolbarAction {
  return {
    id,
    rank,
    icon: () => "key",
    label: id,
    title: () => id,
    activate: () => {},
  };
}

/**
 * La composition des extensions d'un livrable — ADR-extensions-commerciales. Une composition fausse échoue ici, au premier test, et non chez l'utilisateur.
 */
describe("composer", () => {
  it("ne compose rien sans extension : c'est la composition des tests", () => {
    expect(inject(COMPOSITION)).toEqual(compose([]));
    expect(compose([])).toEqual({
      toolbarActions: [],
      banners: [],
      help: { jetons: [], cache: [], communications: [] },
      legalNotice: { host: null, data: [], ownership: [] },
    });
  });

  it("rassemble les apports de chaque extension, point par point", () => {
    const a: Extension = {
      id: "a",
      shell: {
        toolbarActions: [action("a1")],
        banners: [{ id: "a-bandeau", icon: "info", text: () => "Un bandeau." }],
      },
      pages: {
        help: { jetons: ["Une phrase de a."] },
        legalNotice: { host: "Aucun.", data: ["Donnée de a."] },
      },
    };
    const b: Extension = {
      id: "b",
      pages: {
        help: { jetons: ["Une phrase de b."], communications: ["Un hôte."] },
        legalNotice: { ownership: ["Licence de b."] },
      },
    };
    const composition = compose([a, b]);
    expect(composition.toolbarActions.map((x) => x.id)).toEqual(["a1"]);
    expect(composition.banners.map((x) => x.id)).toEqual(["a-bandeau"]);
    expect(composition.help).toEqual({
      jetons: ["Une phrase de a.", "Une phrase de b."],
      cache: [],
      communications: ["Un hôte."],
    });
    expect(composition.legalNotice).toEqual({
      host: "Aucun.",
      data: ["Donnée de a."],
      ownership: ["Licence de b."],
    });
  });

  it("range les apports d'un point par rang, puis dans l'ordre de composition", () => {
    const composition = compose([
      {
        id: "a",
        shell: { toolbarActions: [action("a1"), action("a2", -1)] },
      },
      { id: "b", shell: { toolbarActions: [action("b1", -1)] } },
    ]);
    expect(composition.toolbarActions.map((x) => x.id)).toEqual([
      "a2",
      "b1",
      "a1",
    ]);
  });

  it("refuse deux extensions de même identifiant", () => {
    expect(() => compose([{ id: "a" }, { id: "a" }])).toThrow(/a/);
  });

  it("refuse deux apports de même identifiant sur un point", () => {
    expect(() =>
      compose([
        { id: "a", shell: { toolbarActions: [action("x")] } },
        { id: "b", shell: { toolbarActions: [action("x")] } },
      ]),
    ).toThrow(/x/);
  });

  it("refuse deux hébergeurs : un livrable n'est servi que par un", () => {
    expect(() =>
      compose([
        { id: "a", pages: { legalNotice: { host: "Un." } } },
        { id: "b", pages: { legalNotice: { host: "Deux." } } },
      ]),
    ).toThrow(/hébergeur/);
  });
});
