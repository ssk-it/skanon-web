import { describe, expect, it } from "vitest";
import { apparierChronologie, CommitChronologie } from "./chronologie.service";

/**
 * L'appariement cadrage ↔ commit est la seule logique de ce service qui ne soit
 * pas un appel réseau, et c'est celle qui décide de ce que le lecteur voit.
 *
 * Le cas qui compte est le référentiel rédigé après coup : plusieurs cadrages
 * décrivent des décisions antérieures au dépôt, et aucun commit ne leur
 * correspond. Les masquer prétendrait que la décision n'a pas eu lieu.
 */
function commit(titre: string, oid = "abc1234"): CommitChronologie {
  return {
    oid,
    date: "2026-08-31T12:00:00Z",
    auteur: "Sébastien Skorupski",
    login: "sskorupski",
    titre,
    pullRequest: null,
    contenu: null,
  };
}

describe("appariement d’une chronologie", () => {
  it("rattache un cadrage au commit dont le message le cite", () => {
    const entrees = apparierChronologie(
      ["2026-011"],
      [commit("Cadrage 2026-011 : distribution de l’automatisation")],
    );

    expect(entrees.length).toBe(1);
    expect(entrees[0].commit?.login).toBe("sskorupski");
  });

  it("conserve un cadrage sans commit, sans ses données Git", () => {
    const entrees = apparierChronologie(
      ["2026-001", "2026-011"],
      [commit("Cadrage 2026-011 : x")],
    );

    expect(entrees.map((e) => e.cadrage)).toEqual(["2026-001", "2026-011"]);
    // le cadrage antérieur au dépôt reste visible, simplement sans date
    expect(entrees[0].commit).toBeNull();
    expect(entrees[1].commit).not.toBeNull();
  });

  it("n’attribue jamais deux fois le même commit", () => {
    // un message citant deux cadrages daterait les deux du même commit, ce qui
    // afficherait une date fausse sur l'un des deux
    const entrees = apparierChronologie(
      ["2026-001", "2026-002"],
      [commit("Cadrages 2026-001 et 2026-002 : socle", "aaa")],
    );

    expect(entrees[0].commit?.oid).toBe("aaa");
    expect(entrees[1].commit).toBeNull();
  });

  it("ignore les commits qui ne citent aucun cadrage", () => {
    const entrees = apparierChronologie(
      ["2026-011"],
      [commit("Corrige une coquille")],
    );

    expect(entrees[0].commit).toBeNull();
  });

  it("retourne une entrée par cadrage même sans aucun commit", () => {
    const entrees = apparierChronologie(["2026-001", "2026-002"], []);

    expect(entrees.length).toBe(2);
    expect(entrees.every((e) => e.commit === null)).toBe(true);
  });
});
