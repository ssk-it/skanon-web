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
 * Search — RG-recherche-perimetre and RG-recherche-en-cours-a-part.
 *
 * The index is a pure function of the in-memory specification: what is tested
 * here is what it covers, and what it sets apart. That it costs no call follows
 * from its very form — it receives nothing other than what is already loaded.
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

describe("search", () => {
  describe("what it covers", () => {
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

    it("finds a rule, a decision, an architecture document and a scoping", () => {
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

    it("searches the body, not only the title", () => {
      const r = search(ref, "soixante");

      expect(r.specification.map((x) => x.id)).toEqual(["RG-quota"]);
    });

    it("finds a scoping decision, and leads to its anchor in the scoping", () => {
      const r = search(ref, "canal");

      const found = r.specification.find((x) => x.kind === "decision");
      expect(found?.title).toBe("Par quel canal lire les contenus ?");
      expect(found?.link).toEqual(["cadrages", "2026-006"]);
      expect(found?.anchor).toBe("decision-01-canal");
    });

    it("finds the reason of a rejected option", () => {
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

    it("leads each kind to its usual view", () => {
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

  describe("the query", () => {
    const ref = specification({
      rules: [
        rule(
          "RG-pieces-jointes",
          "Une pièce jointe est stockée sous son empreinte.",
        ),
        rule("RG-ordre-upload", "Le téléversement précède le commit."),
      ],
    });

    it("ignores case and accents", () => {
      expect(search(ref, "PIECE").specification.map((x) => x.id)).toEqual([
        "RG-pieces-jointes",
      ]);
      expect(
        search(ref, "televersement").specification.map((x) => x.id),
      ).toEqual(["RG-ordre-upload"]);
    });

    it("requires each word, in any order", () => {
      expect(
        search(ref, "empreinte pièce").specification.map((x) => x.id),
      ).toEqual(["RG-pieces-jointes"]);
      expect(search(ref, "empreinte commit").specification).toEqual([]);
    });

    it("returns nothing for an empty query", () => {
      const r = search(ref, "   ");

      expect(r.specification).toEqual([]);
      expect(r.inProgress).toEqual([]);
    });

    it("puts first what matches by identifier", () => {
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

  describe("the excerpt", () => {
    it("shows the passage where the word appears, without markup", () => {
      const long = `${"Préambule sans rapport. ".repeat(20)}Le **quota** anonyme est de soixante appels.`;
      const ref = specification({ rules: [rule("RG-quota", long)] });

      const excerpt = search(ref, "anonyme").specification[0].excerpt;

      expect(excerpt).toContain("quota anonyme est de soixante");
      expect(excerpt).not.toContain("**");
      expect(excerpt.length).toBeLessThan(200);
    });
  });

  describe("scopings in progress", () => {
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

    it("sets them apart, with their decisions", () => {
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

    it("carry the mark of their pull request", () => {
      const r = search(ref, "étroit");

      expect(r.inProgress[0].pullRequest).toBe(61);
    });
  });

  describe("the displayed identifier", () => {
    it("carries the project prefix, and is found by it", () => {
      const ref = specification({
        prefix: "SC",
        scopings: [scoping("2026-042", "Recherche")],
      });

      const r = search(ref, "SC-2026-042");

      expect(r.specification.map((x) => x.identifier)).toEqual(["SC-2026-042"]);
    });
  });
});
