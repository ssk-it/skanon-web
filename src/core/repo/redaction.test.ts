import { describe, expect, it } from "vitest";
import {
  prochainIdCadrage,
  serializeNouveauCadrage,
  serializeCadrage,
  CadrageEditable,
} from "./redaction.service";
import {
  splitFrontmatter,
  estIllisible,
  extractSection,
  extractEnonces,
} from "./frontmatter";

/**
 * Le fichier produit ici est lu par le vérificateur d'intégrité, qui bloque la
 * pull request s'il ne convient pas. Ces cas portent donc sur ce que ce fichier
 * doit garantir, pas sur le confort de l'appelant.
 */
describe("identifiant du prochain cadrage", () => {
  it("démarre à 001 pour une année sans cadrage", () => {
    expect(prochainIdCadrage([], 2026)).toBe("2026-001");
  });

  it("suit la plus haute séquence de l’année", () => {
    expect(prochainIdCadrage(["2026-001", "2026-013", "2026-007"], 2026)).toBe(
      "2026-014",
    );
  });

  it("ignore les cadrages des autres années", () => {
    expect(prochainIdCadrage(["2025-042", "2026-002"], 2026)).toBe("2026-003");
  });

  it("ne comble jamais un trou", () => {
    // un identifiant abandonné reste brûlé : le réutiliser ferait pointer
    // d'anciennes références vers un cadrage sans rapport
    expect(prochainIdCadrage(["2026-001", "2026-002", "2026-005"], 2026)).toBe(
      "2026-006",
    );
  });

  it("ignore un identifiant hors format", () => {
    expect(prochainIdCadrage(["brouillon", "2026-004"], 2026)).toBe("2026-005");
  });
});

describe("sérialisation d’un cadrage neuf", () => {
  const BASE = {
    titre: "Un titre ordinaire",
    domaines: ["cadrage", "referentiel"],
    objectif: "Le pourquoi.",
    parcours: "1. Une étape.",
  };

  function relire(texte: string) {
    const r = splitFrontmatter(texte);
    if (!r || estIllisible(r))
      throw new Error(`frontmatter illisible : ${texte}`);
    return r;
  }

  it("produit un frontmatter relisible par le parseur du produit", () => {
    const { data } = relire(serializeNouveauCadrage("2026-014", BASE));
    expect(data["id"]).toBe("2026-014");
    // Aucun statut : il se déduit de l'état du dépôt, et le vérificateur de
    // l'Action refuse un cadrage qui en déclare un.
    expect(data["statut"]).toBeUndefined();
    expect(data["domaines"]).toEqual(["cadrage", "referentiel"]);
  });

  it("échappe un titre contenant « : », qui sinon casse le YAML", () => {
    // la faute la plus fréquente du format, rencontrée en usage réel
    const texte = serializeNouveauCadrage("2026-014", {
      ...BASE,
      titre: "Écriture : par où commencer ?",
    });
    expect(relire(texte).data["titre"]).toBe("Écriture : par où commencer ?");
  });

  it("échappe une apostrophe dans un titre échappé", () => {
    const texte = serializeNouveauCadrage("2026-014", {
      ...BASE,
      titre: "L'écriture : c'est parti",
    });
    expect(relire(texte).data["titre"]).toBe("L'écriture : c'est parti");
  });

  it("n’échappe pas un titre qui n’en a pas besoin", () => {
    expect(serializeNouveauCadrage("2026-014", BASE)).toContain(
      "titre: Un titre ordinaire\n",
    );
  });

  it("déclare des impacts vides plutôt que de les omettre", () => {
    // un cadrage neuf n'impacte rien encore ; omettre la clé ferait échouer la
    // lecture chez qui la suppose présente
    expect(
      relire(serializeNouveauCadrage("2026-014", BASE)).data["impacts"],
    ).toEqual([]);
  });

  it("accepte un cadrage sans domaine", () => {
    const texte = serializeNouveauCadrage("2026-014", {
      ...BASE,
      domaines: [],
    });
    expect(relire(texte).data["domaines"]).toEqual([]);
  });

  it("rend les sections attendues par le format", () => {
    const { body } = relire(serializeNouveauCadrage("2026-014", BASE));
    expect(extractSection(body, "Objectif")).toBe("Le pourquoi.");
    expect(extractSection(body, "Parcours utilisateur")).toBe("1. Une étape.");
  });
});

describe("sérialisation d’un cadrage avec impacts", () => {
  const BASE: CadrageEditable = {
    titre: "Un cadrage",
    domaines: ["cadrage"],
    objectif: "Le pourquoi.",
    parcours: "1. Une étape.",
    impacts: [],
  };

  function relire(texte: string) {
    const r = splitFrontmatter(texte);
    if (!r || estIllisible(r))
      throw new Error(`frontmatter illisible : ${texte}`);
    return r;
  }

  it("rend les impacts relisibles par le parseur", () => {
    const texte = serializeCadrage("2026-020", {
      ...BASE,
      impacts: [
        { cible: "RG-a", operation: "cree", enonce: "Texte A." },
        { cible: "RG-b", operation: "touche", enonce: "" },
      ],
    });
    // Le fichier porte `regle:` — c'est le champ que la nature « regle » écrit,
    // et ce que le parseur relit.
    expect(relire(texte).data["impacts"]).toEqual([
      { regle: "RG-a", operation: "cree" },
      { regle: "RG-b", operation: "touche" },
    ]);
  });

  it("place chaque énoncé sous un titre portant l’identifiant de sa règle", () => {
    const texte = serializeCadrage("2026-020", {
      ...BASE,
      impacts: [
        { cible: "RG-a", operation: "modifie", enonce: "Le nouvel énoncé." },
      ],
    });
    expect(extractEnonces(relire(texte).body).get("RG-a")).toBe(
      "Le nouvel énoncé.",
    );
  });

  it("omet la section Énoncés quand rien n’est à énoncer", () => {
    // une section vide suggérerait au lecteur qu'il manque quelque chose
    const texte = serializeCadrage("2026-020", {
      ...BASE,
      impacts: [{ cible: "RG-b", operation: "touche", enonce: "" }],
    });
    expect(texte).not.toContain("## Énoncés");
  });

  it("n’écrit aucun statut, que le vérificateur refuserait", () => {
    // Le statut vit sur la demande de fusion, non dans le fichier. L'y écrire
    // produisait un cadrage rejeté en intégration continue.
    expect(
      relire(serializeCadrage("2026-020", BASE)).data["statut"],
    ).toBeUndefined();
  });
});
