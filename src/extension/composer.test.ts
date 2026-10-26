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
 * The composition of a deliverable's extensions — ADR-extensions-commerciales. A wrong composition fails here, at the first test, and not at the user's.
 */
describe("compose", () => {
  it("composes nothing without an extension: it is the tests' composition", () => {
    expect(inject(COMPOSITION)).toEqual(compose([]));
    expect(compose([])).toEqual({
      toolbarActions: [],
      banners: [],
      help: { jetons: [], cache: [], communications: [] },
      legalNotice: { host: null, data: [], ownership: [] },
    });
  });

  it("gathers each extension's contributions, point by point", () => {
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

  it("orders a point's contributions by rank, then in composition order", () => {
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

  it("refuses two extensions with the same identifier", () => {
    expect(() => compose([{ id: "a" }, { id: "a" }])).toThrow(/a/);
  });

  it("refuses two contributions with the same identifier on a point", () => {
    expect(() =>
      compose([
        { id: "a", shell: { toolbarActions: [action("x")] } },
        { id: "b", shell: { toolbarActions: [action("x")] } },
      ]),
    ).toThrow(/x/);
  });

  it("refuses two hosts: a deliverable is served by only one", () => {
    expect(() =>
      compose([
        { id: "a", pages: { legalNotice: { host: "Un." } } },
        { id: "b", pages: { legalNotice: { host: "Deux." } } },
      ]),
    ).toThrow(/hébergeur/);
  });
});
