import { describe, expect, it } from "vitest";
import {
  Cadrage,
  Decision,
  DecisionArchitecture,
  DocumentArchitecture,
  Referentiel,
  Regle,
  TAGS_LIENS_PAR_DEFAUT,
} from "../model/model";
import { buildIndexRecherche, findResultats } from "./recherche";

/**
 * La recherche — RG-recherche-perimetre et RG-recherche-en-cours-a-part.
 *
 * L'index est une fonction pure du référentiel en mémoire : ce qui est éprouvé
 * ici, c'est sur quoi il porte, et ce qu'il range à part. Qu'il ne coûte aucun
 * appel découle de sa forme même — il ne reçoit rien d'autre que ce qui est
 * déjà chargé.
 */

function regle(id: string, enonce: string): Regle {
  return {
    id,
    statut: "actif",
    fonctionnalites: [],
    enonce,
    creePar: null,
    modifiePar: [],
  };
}

function adr(id: string, enonce: string): DecisionArchitecture {
  return { id, statut: "actif", enonce, creePar: null, modifiePar: [] };
}

function document(id: string, enonce: string): DocumentArchitecture {
  return {
    id,
    nature: "composant",
    statut: "actif",
    composants: [],
    enonce,
    creePar: null,
    modifiePar: [],
  };
}

function decision(
  id: string,
  titre: string,
  options: Array<[string, string]> = [],
): Decision {
  return {
    id,
    titre,
    statut: "retenue",
    optionRetenue: options[0]?.[0] ?? null,
    description: "",
    options: options.map(([idOption, corps], i) => ({
      id: idOption,
      titre: idOption,
      retenue: i === 0,
      corps,
    })),
    corps: "",
  };
}

function cadrage(
  id: string,
  titre: string,
  extra: Partial<Cadrage> = {},
): Cadrage {
  return {
    id,
    titre,
    statut: "livree",
    domaines: [],
    liens: [],
    impacts: [],
    objectif: "",
    parcours: "",
    enonces: new Map(),
    decisions: [],
    piecesJointes: [],
    divers: [],
    ...extra,
  };
}

function referentiel(contenu: {
  regles?: Regle[];
  decisions?: DecisionArchitecture[];
  architecture?: DocumentArchitecture[];
  cadrages?: Cadrage[];
  prefixe?: string | null;
}): Referentiel {
  const parId = <T extends { id: string }>(l: T[] = []) =>
    new Map(l.map((e) => [e.id, e]));
  return {
    projet: {
      nom: "Test",
      description: "",
      depotsCode: [],
      prefixe: contenu.prefixe ?? null,
    },
    reglages: {
      acces: "jeton_personnel",
      identite: null,
      protectionDuJeton: "proposee",
      tagsLiens: TAGS_LIENS_PAR_DEFAUT,
    },
    domaines: new Map(),
    fonctionnalites: new Map(),
    regles: parId(contenu.regles),
    decisions: parId(contenu.decisions),
    architecture: parId(contenu.architecture),
    cadrages: parId(contenu.cadrages),
    anomalies: [],
  };
}

const EN_COURS = {
  provenance: {
    branche: "cadrage-2026-050",
    pullRequest: 61,
    brouillon: false,
  },
  statut: "en_relecture" as const,
};

function chercher(ref: Referentiel, requete: string) {
  return findResultats(buildIndexRecherche(ref), requete);
}

describe("la recherche", () => {
  describe("ce sur quoi elle porte", () => {
    const ref = referentiel({
      regles: [
        regle("RG-quota", "Le **quota** anonyme est de soixante appels."),
      ],
      decisions: [adr("ADR-quota-cache", "Les contenus échappent au quota.")],
      architecture: [document("CMP-proxy", "Le proxy ne régule pas le quota.")],
      cadrages: [
        cadrage("2026-006", "Charger un dépôt sans épuiser le quota", {
          decisions: [
            decision("01-canal", "Par quel canal lire les contenus ?"),
          ],
        }),
      ],
    });

    it("trouve une règle, une décision, un document d’architecture et un cadrage", () => {
      const r = chercher(ref, "quota");

      expect(r.referentiel.map((x) => [x.nature, x.id])).toEqual(
        expect.arrayContaining([
          ["regle", "RG-quota"],
          ["decision", "ADR-quota-cache"],
          ["architecture", "CMP-proxy"],
          ["cadrage", "2026-006"],
        ]),
      );
    });

    it("cherche dans le corps, non seulement dans le titre", () => {
      const r = chercher(ref, "soixante");

      expect(r.referentiel.map((x) => x.id)).toEqual(["RG-quota"]);
    });

    it("trouve une décision de cadrage, et mène à son ancre dans le cadrage", () => {
      const r = chercher(ref, "canal");

      const trouve = r.referentiel.find((x) => x.nature === "decision");
      expect(trouve?.titre).toBe("Par quel canal lire les contenus ?");
      expect(trouve?.lien).toEqual(["cadrages", "2026-006"]);
      expect(trouve?.ancre).toBe("decision-01-canal");
    });

    it("trouve le motif d’une option écartée", () => {
      const ref = referentiel({
        cadrages: [
          cadrage("2026-001", "Support de persistance", {
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
        chercher(ref, "sources de vérité").referentiel.map((x) => x.id),
      ).toEqual(["2026-001/01-support"]);
    });

    it("mène chaque nature à sa vue habituelle", () => {
      const liens = Object.fromEntries(
        chercher(ref, "quota").referentiel.map((x) => [x.id, x.lien]),
      );

      expect(liens["RG-quota"]).toEqual(["referentiel", "regle", "RG-quota"]);
      expect(liens["ADR-quota-cache"]).toEqual([
        "architecture",
        "decision",
        "ADR-quota-cache",
      ]);
      expect(liens["CMP-proxy"]).toEqual([
        "architecture",
        "document",
        "CMP-proxy",
      ]);
      expect(liens["2026-006"]).toEqual(["cadrages", "2026-006"]);
    });
  });

  describe("la requête", () => {
    const ref = referentiel({
      regles: [
        regle(
          "RG-pieces-jointes",
          "Une pièce jointe est stockée sous son empreinte.",
        ),
        regle("RG-ordre-upload", "Le téléversement précède le commit."),
      ],
    });

    it("ignore la casse et les accents", () => {
      expect(chercher(ref, "PIECE").referentiel.map((x) => x.id)).toEqual([
        "RG-pieces-jointes",
      ]);
      expect(
        chercher(ref, "televersement").referentiel.map((x) => x.id),
      ).toEqual(["RG-ordre-upload"]);
    });

    it("exige chaque mot, dans n’importe quel ordre", () => {
      expect(
        chercher(ref, "empreinte pièce").referentiel.map((x) => x.id),
      ).toEqual(["RG-pieces-jointes"]);
      expect(chercher(ref, "empreinte commit").referentiel).toEqual([]);
    });

    it("ne rend rien pour une requête vide", () => {
      const r = chercher(ref, "   ");

      expect(r.referentiel).toEqual([]);
      expect(r.enCours).toEqual([]);
    });

    it("place en tête ce qui correspond par l’identifiant", () => {
      const ref = referentiel({
        regles: [
          regle("RG-autre", "Rien à voir, sinon le mot cache."),
          regle("RG-cache", "Un énoncé."),
        ],
      });

      expect(chercher(ref, "cache").referentiel.map((x) => x.id)).toEqual([
        "RG-cache",
        "RG-autre",
      ]);
    });
  });

  describe("l’extrait", () => {
    it("montre le passage où le mot apparaît, sans balisage", () => {
      const long = `${"Préambule sans rapport. ".repeat(20)}Le **quota** anonyme est de soixante appels.`;
      const ref = referentiel({ regles: [regle("RG-quota", long)] });

      const extrait = chercher(ref, "anonyme").referentiel[0].extrait;

      expect(extrait).toContain("quota anonyme est de soixante");
      expect(extrait).not.toContain("**");
      expect(extrait.length).toBeLessThan(200);
    });
  });

  describe("les cadrages en cours", () => {
    const ref = referentiel({
      regles: [
        regle("RG-barre", "La barre de navigation présente quatre entrées."),
      ],
      cadrages: [
        cadrage("2026-041", "Donner à l’architecture sa place dans la barre"),
        cadrage("2026-050", "Alléger la barre sur écran étroit", {
          ...EN_COURS,
          decisions: [
            decision("01-ce-qui-cede", "Qu’est-ce qui cède dans la barre ?"),
          ],
        }),
      ],
    });

    it("les range à part, avec leurs décisions", () => {
      const r = chercher(ref, "barre");

      expect(r.referentiel.map((x) => x.id)).toEqual(
        expect.arrayContaining(["RG-barre", "2026-041"]),
      );
      expect(r.referentiel.map((x) => x.id)).not.toContain("2026-050");
      expect(r.enCours.map((x) => x.id)).toEqual([
        "2026-050",
        "2026-050/01-ce-qui-cede",
      ]);
    });

    it("portent la marque de leur demande de fusion", () => {
      const r = chercher(ref, "étroit");

      expect(r.enCours[0].pullRequest).toBe(61);
    });
  });

  describe("l’identifiant affiché", () => {
    it("porte le préfixe du projet, et se trouve par lui", () => {
      const ref = referentiel({
        prefixe: "SC",
        cadrages: [cadrage("2026-042", "Recherche")],
      });

      const r = chercher(ref, "SC-2026-042");

      expect(r.referentiel.map((x) => x.identifiant)).toEqual(["SC-2026-042"]);
    });
  });
});
