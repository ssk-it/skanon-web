import { describe, expect, it } from "vitest";
import { serializeDecision } from "./redaction.service";
import {
  splitFrontmatter,
  estIllisible,
  extractSection,
  extractSousSections,
} from "./frontmatter";

/** Analyse le texte produit, en échouant clairement s'il est illisible. */
function relire(texte: string): {
  data: Record<string, unknown>;
  body: string;
} {
  const parse = splitFrontmatter(texte);
  if (parse === null) throw new Error("aucun frontmatter produit");
  if (estIllisible(parse))
    throw new Error(`frontmatter illisible : ${parse.erreur}`);
  return { data: parse.data as Record<string, unknown>, body: parse.body };
}

/**
 * Ce que l'application écrit doit se relire à l'identique — par elle-même comme
 * par le vérificateur. Un écart ne se verrait qu'au rechargement, une fois le
 * fichier commité : le pire moment pour l'apprendre.
 */
describe("écriture d’une décision", () => {
  const decision = {
    titre: "Où stocker les pièces jointes ?",
    statut: "retenue" as const,
    description: "Ce qui rendait la question ouverte.",
    options: [
      { id: "dans-la-base", corps: "**Pour** — simple.\n**Contre** — lourd." },
      { id: "stockage-objet", corps: "**Pour** — passe à l’échelle." },
    ],
    optionRetenue: "stockage-objet",
    decision: "Ce qui a tranché, en une phrase.",
  };

  it("produit un frontmatter que la lecture accepte", () => {
    const { data } = relire(serializeDecision("01-stockage", decision));
    expect(data["id"]).toBe("01-stockage");
    expect(data["statut"]).toBe("retenue");
    expect(data["option_retenue"]).toBe("stockage-objet");
  });

  it("relit les options telles qu’elles ont été écrites", () => {
    const options = [
      ...extractSousSections(
        relire(serializeDecision("01-stockage", decision)).body,
        "Options",
      ),
    ];
    expect(options.map(([titre]) => titre)).toEqual([
      "dans-la-base",
      "stockage-objet",
    ]);
  });

  it("marque l’option retenue dans son texte, pour qui lit le fichier seul", () => {
    const out = serializeDecision("01-stockage", decision);
    const options = [...extractSousSections(relire(out).body, "Options")];
    const retenue = options.find(([t]) => t === "stockage-objet")![1];
    expect(retenue).toContain("**Retenue.**");
    expect(options.find(([t]) => t === "dans-la-base")![1]).not.toContain(
      "Retenue",
    );
  });

  it("relit la description et ce qui a tranché", () => {
    const { body } = relire(serializeDecision("01-stockage", decision));
    expect(extractSection(body, "Description")).toContain("question ouverte");
    expect(extractSection(body, "Décision")).toContain("a tranché");
  });

  it("écrit null quand rien n’est encore tranché", () => {
    // Une décision ouverte est le cas normal d'un cadrage en cours : elle ne
    // doit pas être refusée, ni prétendre avoir une option retenue.
    const out = serializeDecision("01-x", {
      ...decision,
      statut: "ouverte",
      optionRetenue: null,
    });
    expect(relire(out).data["option_retenue"]).toBeNull();
    expect(out).not.toContain("**Retenue.**");
  });

  it("échappe un titre contenant deux-points", () => {
    // La faute la plus fréquente du format : YAML lit le `:` comme séparateur.
    const out = serializeDecision("01-x", {
      ...decision,
      titre: "Stockage : où ?",
    });
    expect(relire(out).data["titre"]).toBe("Stockage : où ?");
  });

  it("omet les sections vides plutôt que d’écrire des titres creux", () => {
    const out = serializeDecision("01-x", {
      ...decision,
      options: [],
      decision: "",
    });
    expect(out).not.toContain("## Options");
    expect(out).not.toContain("## Décision");
  });

  it("écarte une option sans identifiant", () => {
    const out = serializeDecision("01-x", {
      ...decision,
      options: [...decision.options, { id: "  ", corps: "orpheline" }],
    });
    expect([...extractSousSections(relire(out).body, "Options")].length).toBe(
      2,
    );
  });
});
