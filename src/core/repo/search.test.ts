import { describe, expect, it } from "vitest";
import {
  Scoping,
  Decision,
  ArchitectureDecision,
  ArchitectureDocument,
  Specification,
  Rule,
  DEFAULT_LINK_TAGS,
} from "../model/model";
import { buildSearchIndex, findResults } from "./search";

/**
 * La recherche — RG-recherche-perimetre et RG-recherche-en-cours-a-part.
 *
 * L'index est une fonction pure du référentiel en mémoire : ce qui est éprouvé
 * ici, c'est sur quoi il porte, et ce qu'il range à part. Qu'il ne coûte aucun
 * appel découle de sa forme même — il ne reçoit rien d'autre que ce qui est
 * déjà chargé.
 */

function rule(id: string, statement: string): Rule {
  return {
    id,
    status: "actif",
    features: [],
    statement,
    createdBy: null,
    modifiedBy: [],
  };
}

function adr(id: string, statement: string): ArchitectureDecision {
  return { id, status: "actif", statement, createdBy: null, modifiedBy: [] };
}

function document(id: string, statement: string): ArchitectureDocument {
  return {
    id,
    kind: "composant",
    status: "actif",
    components: [],
    statement,
    createdBy: null,
    modifiedBy: [],
  };
}

function decision(
  id: string,
  title: string,
  options: Array<[string, string]> = [],
): Decision {
  return {
    id,
    title,
    status: "retenue",
    chosenOption: options[0]?.[0] ?? null,
    description: "",
    options: options.map(([idOption, body], i) => ({
      id: idOption,
      title: idOption,
      chosen: i === 0,
      body: body,
    })),
    body: "",
  };
}

function scoping(
  id: string,
  title: string,
  extra: Partial<Scoping> = {},
): Scoping {
  return {
    id,
    title,
    status: "livree",
    domains: [],
    links: [],
    impacts: [],
    goal: "",
    journey: "",
    statements: new Map(),
    decisions: [],
    attachments: [],
    misc: [],
    ...extra,
  };
}

function specification(content: {
  rules?: Rule[];
  decisions?: ArchitectureDecision[];
  architecture?: ArchitectureDocument[];
  scopings?: Scoping[];
  prefix?: string | null;
}): Specification {
  const byId = <T extends { id: string }>(l: T[] = []) =>
    new Map(l.map((e) => [e.id, e]));
  return {
    project: {
      name: "Test",
      description: "",
      codeRepos: [],
      prefix: content.prefix ?? null,
    },
    settings: {
      access: "jeton_personnel",
      identity: null,
      tokenProtection: "proposee",
      linkTags: DEFAULT_LINK_TAGS,
    },
    domains: new Map(),
    features: new Map(),
    rules: byId(content.rules),
    decisions: byId(content.decisions),
    architecture: byId(content.architecture),
    scopings: byId(content.scopings),
    anomalies: [],
  };
}

const IN_PROGRESS = {
  provenance: {
    branch: "cadrage-2026-050",
    pullRequest: 61,
    draft: false,
  },
  status: "en_relecture" as const,
};

function search(ref: Specification, query: string) {
  return findResults(buildSearchIndex(ref), query);
}

describe("la recherche", () => {
  describe("ce sur quoi elle porte", () => {
    const ref = specification({
      rules: [rule("RG-quota", "Le **quota** anonyme est de soixante appels.")],
      decisions: [adr("ADR-quota-cache", "Les contenus échappent au quota.")],
      architecture: [document("CMP-proxy", "Le proxy ne régule pas le quota.")],
      scopings: [
        scoping("2026-006", "Charger un dépôt sans épuiser le quota", {
          decisions: [
            decision("01-canal", "Par quel canal lire les contenus ?"),
          ],
        }),
      ],
    });

    it("trouve une règle, une décision, un document d’architecture et un cadrage", () => {
      const r = search(ref, "quota");

      expect(r.specification.map((x) => [x.kind, x.id])).toEqual(
        expect.arrayContaining([
          ["regle", "RG-quota"],
          ["decision", "ADR-quota-cache"],
          ["architecture", "CMP-proxy"],
          ["cadrage", "2026-006"],
        ]),
      );
    });

    it("cherche dans le corps, non seulement dans le titre", () => {
      const r = search(ref, "soixante");

      expect(r.specification.map((x) => x.id)).toEqual(["RG-quota"]);
    });

    it("trouve une décision de cadrage, et mène à son ancre dans le cadrage", () => {
      const r = search(ref, "canal");

      const found = r.specification.find((x) => x.kind === "decision");
      expect(found?.title).toBe("Par quel canal lire les contenus ?");
      expect(found?.link).toEqual(["cadrages", "2026-006"]);
      expect(found?.anchor).toBe("decision-01-canal");
    });

    it("trouve le motif d’une option écartée", () => {
      const ref = specification({
        scopings: [
          scoping("2026-001", "Support de persistance", {
            decisions: [
              decision("01-support", "Où vivent les données ?", [
                ["git", "Retenue."],
                ["base", "Deux sources de vérité à garder cohérentes."],
              ]),
            ],
          }),
        ],
      });

      expect(
        search(ref, "sources de vérité").specification.map((x) => x.id),
      ).toEqual(["2026-001/01-support"]);
    });

    it("mène chaque nature à sa vue habituelle", () => {
      const links = Object.fromEntries(
        search(ref, "quota").specification.map((x) => [x.id, x.link]),
      );

      expect(links["RG-quota"]).toEqual(["referentiel", "regle", "RG-quota"]);
      expect(links["ADR-quota-cache"]).toEqual([
        "architecture",
        "decision",
        "ADR-quota-cache",
      ]);
      expect(links["CMP-proxy"]).toEqual([
        "architecture",
        "document",
        "CMP-proxy",
      ]);
      expect(links["2026-006"]).toEqual(["cadrages", "2026-006"]);
    });
  });

  describe("la requête", () => {
    const ref = specification({
      rules: [
        rule(
          "RG-pieces-jointes",
          "Une pièce jointe est stockée sous son empreinte.",
        ),
        rule("RG-ordre-upload", "Le téléversement précède le commit."),
      ],
    });

    it("ignore la casse et les accents", () => {
      expect(search(ref, "PIECE").specification.map((x) => x.id)).toEqual([
        "RG-pieces-jointes",
      ]);
      expect(
        search(ref, "televersement").specification.map((x) => x.id),
      ).toEqual(["RG-ordre-upload"]);
    });

    it("exige chaque mot, dans n’importe quel ordre", () => {
      expect(
        search(ref, "empreinte pièce").specification.map((x) => x.id),
      ).toEqual(["RG-pieces-jointes"]);
      expect(search(ref, "empreinte commit").specification).toEqual([]);
    });

    it("ne rend rien pour une requête vide", () => {
      const r = search(ref, "   ");

      expect(r.specification).toEqual([]);
      expect(r.inProgress).toEqual([]);
    });

    it("place en tête ce qui correspond par l’identifiant", () => {
      const ref = specification({
        rules: [
          rule("RG-autre", "Rien à voir, sinon le mot cache."),
          rule("RG-cache", "Un énoncé."),
        ],
      });

      expect(search(ref, "cache").specification.map((x) => x.id)).toEqual([
        "RG-cache",
        "RG-autre",
      ]);
    });
  });

  describe("l’extrait", () => {
    it("montre le passage où le mot apparaît, sans balisage", () => {
      const long = `${"Préambule sans rapport. ".repeat(20)}Le **quota** anonyme est de soixante appels.`;
      const ref = specification({ rules: [rule("RG-quota", long)] });

      const excerpt = search(ref, "anonyme").specification[0].excerpt;

      expect(excerpt).toContain("quota anonyme est de soixante");
      expect(excerpt).not.toContain("**");
      expect(excerpt.length).toBeLessThan(200);
    });
  });

  describe("les cadrages en cours", () => {
    const ref = specification({
      rules: [
        rule("RG-barre", "La barre de navigation présente quatre entrées."),
      ],
      scopings: [
        scoping("2026-041", "Donner à l’architecture sa place dans la barre"),
        scoping("2026-050", "Alléger la barre sur écran étroit", {
          ...IN_PROGRESS,
          decisions: [
            decision("01-ce-qui-cede", "Qu’est-ce qui cède dans la barre ?"),
          ],
        }),
      ],
    });

    it("les range à part, avec leurs décisions", () => {
      const r = search(ref, "barre");

      expect(r.specification.map((x) => x.id)).toEqual(
        expect.arrayContaining(["RG-barre", "2026-041"]),
      );
      expect(r.specification.map((x) => x.id)).not.toContain("2026-050");
      expect(r.inProgress.map((x) => x.id)).toEqual([
        "2026-050",
        "2026-050/01-ce-qui-cede",
      ]);
    });

    it("portent la marque de leur demande de fusion", () => {
      const r = search(ref, "étroit");

      expect(r.inProgress[0].pullRequest).toBe(61);
    });
  });

  describe("l’identifiant affiché", () => {
    it("porte le préfixe du projet, et se trouve par lui", () => {
      const ref = specification({
        prefix: "SC",
        scopings: [scoping("2026-042", "Recherche")],
      });

      const r = search(ref, "SC-2026-042");

      expect(r.specification.map((x) => x.identifier)).toEqual(["SC-2026-042"]);
    });
  });
});
