import { describe, expect, it } from "vitest";
import {
  nextScopingId,
  serializeNewScoping,
  serializeScoping,
  EditableScoping,
} from "./authoring.service";
import {
  splitFrontmatter,
  isUnreadable,
  extractSection,
  extractStatements,
} from "./frontmatter";

/**
 * Le fichier produit ici est lu par le vérificateur d'intégrité, qui bloque la
 * pull request s'il ne convient pas. Ces cas portent donc sur ce que ce fichier
 * doit garantir, pas sur le confort de l'appelant.
 */
describe("identifiant du prochain cadrage", () => {
  it("démarre à 001 pour une année sans cadrage", () => {
    expect(nextScopingId([], 2026)).toBe("2026-001");
  });

  it("suit la plus haute séquence de l’année", () => {
    expect(nextScopingId(["2026-001", "2026-013", "2026-007"], 2026)).toBe(
      "2026-014",
    );
  });

  it("ignore les cadrages des autres années", () => {
    expect(nextScopingId(["2025-042", "2026-002"], 2026)).toBe("2026-003");
  });

  it("ne comble jamais un trou", () => {
    // un identifiant abandonné reste brûlé : le réutiliser ferait pointer
    // d'anciennes références vers un cadrage sans rapport
    expect(nextScopingId(["2026-001", "2026-002", "2026-005"], 2026)).toBe(
      "2026-006",
    );
  });

  it("ignore un identifiant hors format", () => {
    expect(nextScopingId(["brouillon", "2026-004"], 2026)).toBe("2026-005");
  });
});

describe("sérialisation d’un cadrage neuf", () => {
  const BASE = {
    title: "Un titre ordinaire",
    domains: ["cadrage", "referentiel"],
    goal: "Le pourquoi.",
    journey: "1. Une étape.",
  };

  function reread(text: string) {
    const r = splitFrontmatter(text);
    if (!r || isUnreadable(r))
      throw new Error(`frontmatter illisible : ${text}`);
    return r;
  }

  it("produit un frontmatter relisible par le parseur du produit", () => {
    const { data } = reread(serializeNewScoping("2026-014", BASE));
    expect(data["id"]).toBe("2026-014");
    // Aucun statut : il se déduit de l'état du dépôt, et le vérificateur de
    // l'Action refuse un cadrage qui en déclare un.
    expect(data["statut"]).toBeUndefined();
    expect(data["domaines"]).toEqual(["cadrage", "referentiel"]);
  });

  it("échappe un titre contenant « : », qui sinon casse le YAML", () => {
    // la faute la plus fréquente du format, rencontrée en usage réel
    const text = serializeNewScoping("2026-014", {
      ...BASE,
      title: "Écriture : par où commencer ?",
    });
    expect(reread(text).data["titre"]).toBe("Écriture : par où commencer ?");
  });

  it("échappe une apostrophe dans un titre échappé", () => {
    const text = serializeNewScoping("2026-014", {
      ...BASE,
      title: "L'écriture : c'est parti",
    });
    expect(reread(text).data["titre"]).toBe("L'écriture : c'est parti");
  });

  it("n’échappe pas un titre qui n’en a pas besoin", () => {
    expect(serializeNewScoping("2026-014", BASE)).toContain(
      "titre: Un titre ordinaire\n",
    );
  });

  it("déclare des impacts vides plutôt que de les omettre", () => {
    // un cadrage neuf n'impacte rien encore ; omettre la clé ferait échouer la
    // lecture chez qui la suppose présente
    expect(
      reread(serializeNewScoping("2026-014", BASE)).data["impacts"],
    ).toEqual([]);
  });

  it("accepte un cadrage sans domaine", () => {
    const text = serializeNewScoping("2026-014", {
      ...BASE,
      domains: [],
    });
    expect(reread(text).data["domaines"]).toEqual([]);
  });

  it("rend les sections attendues par le format", () => {
    const { body } = reread(serializeNewScoping("2026-014", BASE));
    expect(extractSection(body, "Objectif")).toBe("Le pourquoi.");
    expect(extractSection(body, "Parcours utilisateur")).toBe("1. Une étape.");
  });
});

describe("sérialisation d’un cadrage avec impacts", () => {
  const BASE: EditableScoping = {
    title: "Un cadrage",
    domains: ["cadrage"],
    goal: "Le pourquoi.",
    journey: "1. Une étape.",
    impacts: [],
  };

  function reread(text: string) {
    const r = splitFrontmatter(text);
    if (!r || isUnreadable(r))
      throw new Error(`frontmatter illisible : ${text}`);
    return r;
  }

  it("rend les impacts relisibles par le parseur", () => {
    const text = serializeScoping("2026-020", {
      ...BASE,
      impacts: [
        { target: "RG-a", operation: "cree", statement: "Texte A." },
        { target: "RG-b", operation: "touche", statement: "" },
      ],
    });
    // Le fichier porte `regle:` — c'est le champ que la nature « regle » écrit,
    // et ce que le parseur relit.
    expect(reread(text).data["impacts"]).toEqual([
      { regle: "RG-a", operation: "cree" },
      { regle: "RG-b", operation: "touche" },
    ]);
  });

  it("place chaque énoncé sous un titre portant l’identifiant de sa règle", () => {
    const text = serializeScoping("2026-020", {
      ...BASE,
      impacts: [
        {
          target: "RG-a",
          operation: "modifie",
          statement: "Le nouvel énoncé.",
        },
      ],
    });
    expect(extractStatements(reread(text).body).get("RG-a")).toBe(
      "Le nouvel énoncé.",
    );
  });

  it("omet la section Énoncés quand rien n’est à énoncer", () => {
    // une section vide suggérerait au lecteur qu'il manque quelque chose
    const text = serializeScoping("2026-020", {
      ...BASE,
      impacts: [{ target: "RG-b", operation: "touche", statement: "" }],
    });
    expect(text).not.toContain("## Énoncés");
  });

  it("n’écrit aucun statut, que le vérificateur refuserait", () => {
    // Le statut vit sur la demande de fusion, non dans le fichier. L'y écrire
    // produisait un cadrage rejeté en intégration continue.
    expect(
      reread(serializeScoping("2026-020", BASE)).data["statut"],
    ).toBeUndefined();
  });
});
