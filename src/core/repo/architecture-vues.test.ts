import { inject, resetInjection } from "../injection";
import { beforeEach, describe, expect, it } from "vitest";
import { ReferentielStore } from "./referentiel.store";
import {
  Cadrage,
  DecisionArchitecture,
  DocumentArchitecture,
  Referentiel,
  ReglagesProjet,
  TAGS_LIENS_PAR_DEFAUT,
} from "../model/model";

const REGLAGES: ReglagesProjet = {
  acces: "jeton_personnel",
  identite: null,
  protectionDuJeton: "proposee",
  tagsLiens: TAGS_LIENS_PAR_DEFAUT,
};

function document(
  id: string,
  nature: DocumentArchitecture["nature"],
  composants: string[] = [],
): DocumentArchitecture {
  return {
    id,
    nature,
    statut: "actif",
    composants,
    enonce: "",
    creePar: null,
    modifiePar: [],
  };
}

function decision(id: string): DecisionArchitecture {
  return { id, statut: "actif", enonce: "", creePar: null, modifiePar: [] };
}

function cadrage(id: string, impacts: Cadrage["impacts"]): Cadrage {
  return {
    id,
    titre: `Cadrage ${id}`,
    statut: "livree",
    domaines: [],
    liens: [],
    impacts,
    objectif: "",
    parcours: "",
    enonces: new Map(),
    decisions: [],
    piecesJointes: [],
    sectionsLibres: [],
    provenance: null,
  } as unknown as Cadrage;
}

function referentiel(partiel: Partial<Referentiel>): Referentiel {
  return {
    projet: { nom: "test", description: "", depotsCode: [], prefixe: null },
    reglages: REGLAGES,
    domaines: new Map(),
    fonctionnalites: new Map(),
    regles: new Map(),
    decisions: new Map(),
    architecture: new Map(),
    cadrages: new Map(),
    anomalies: [],
    ...partiel,
  };
}

/**
 * Les vues croisées de l'architecture.
 *
 * Ce qui distingue ces documents d'un wiki n'est pas qu'ils soient versionnés,
 * mais que les relations entre eux se calculent. Une liste « flux touchant ce
 * composant » tenue à la main serait fausse au premier flux ajouté, et son
 * inexactitude ne se verrait jamais.
 */
describe("vues croisées de l’architecture", () => {
  let store: ReferentielStore;

  beforeEach(() => {
    resetInjection();

    store = inject(ReferentielStore);
  });

  it("liste les flux qui touchent un composant", () => {
    store.referentiel.set(
      referentiel({
        architecture: new Map([
          ["CMP-api", document("CMP-api", "composant")],
          [
            "FLX-export",
            document("FLX-export", "flux", ["CMP-api", "CMP-stockage"]),
          ],
          ["FLX-auth", document("FLX-auth", "flux", ["CMP-api"])],
          ["FLX-ailleurs", document("FLX-ailleurs", "flux", ["CMP-autre"])],
        ]),
      }),
    );

    // Ordre des documents du store : par identifiant, comme les règles.
    const flux = store.listFluxByComposant("CMP-api");
    expect(flux.map((f) => f.id)).toEqual(["FLX-auth", "FLX-export"]);
  });

  it("ne retient comme flux que les documents de cette nature", () => {
    store.referentiel.set(
      referentiel({
        architecture: new Map([
          ["CMP-api", document("CMP-api", "composant")],
          // Un contexte peut lui aussi citer des composants : il les cite tous,
          // et le faire remonter parmi les flux noierait la vue qu'on consulte.
          ["CTX-global", document("CTX-global", "contexte", ["CMP-api"])],
          ["FLX-export", document("FLX-export", "flux", ["CMP-api"])],
        ]),
      }),
    );

    expect(store.listFluxByComposant("CMP-api").map((f) => f.id)).toEqual([
      "FLX-export",
    ]);
  });

  it("liste les documents par nature", () => {
    store.referentiel.set(
      referentiel({
        architecture: new Map([
          ["CMP-api", document("CMP-api", "composant")],
          ["FLX-export", document("FLX-export", "flux", ["CMP-api"])],
          ["CTX-global", document("CTX-global", "contexte")],
        ]),
      }),
    );

    expect(
      store.listArchitectureByNature("composant").map((d) => d.id),
    ).toEqual(["CMP-api"]);
    expect(store.listArchitectureByNature("flux").map((d) => d.id)).toEqual([
      "FLX-export",
    ]);
    expect(store.listArchitectureByNature("contexte").map((d) => d.id)).toEqual(
      ["CTX-global"],
    );
  });

  it("remonte d’une cible d’architecture aux cadrages qui l’ont produite", () => {
    store.referentiel.set(
      referentiel({
        decisions: new Map([["ADR-stockage", decision("ADR-stockage")]]),
        cadrages: new Map([
          [
            "2026-001",
            cadrage("2026-001", [
              {
                cible: "ADR-stockage",
                nature: "adr",
                operation: "cree",
                regle: "",
              },
            ]),
          ],
          [
            "2026-002",
            cadrage("2026-002", [
              {
                cible: "ADR-stockage",
                nature: "adr",
                operation: "modifie",
                regle: "",
              },
              {
                cible: "RG-autre",
                nature: "regle",
                operation: "cree",
                regle: "RG-autre",
              },
            ]),
          ],
          [
            "2026-003",
            cadrage("2026-003", [
              {
                cible: "RG-sans-rapport",
                nature: "regle",
                operation: "cree",
                regle: "RG-sans-rapport",
              },
            ]),
          ],
        ]),
      }),
    );

    // Ordre des cadrages du store : cycle de vie, puis identifiant décroissant
    // — le plus récent d'abord, ce qui vaut aussi pour cette remontée.
    const cadrages = store.listCadragesImpactantCible("ADR-stockage");
    expect(cadrages.map((c) => c.cadrage.id)).toEqual(["2026-002", "2026-001"]);
    expect(cadrages.map((c) => c.operation)).toEqual(["modifie", "cree"]);
  });

  it("rend l’énoncé d’un impact visant une cible d’architecture", () => {
    // Le défaut que ce cas protège : la résolution lisait `regle`, vide pour un
    // impact d'architecture. L'énoncé existait dans le cadrage et n'était
    // affiché nulle part — le pire des cas, puisque rien ne signale une section
    // qu'on ne voit pas.
    const c = cadrage("2026-001", [
      {
        cible: "FLX-export",
        nature: "architecture",
        operation: "cree",
        regle: "",
      },
      { cible: "RG-a", nature: "regle", operation: "cree", regle: "RG-a" },
    ]);
    (c as unknown as { enonces: Map<string, string> }).enonces = new Map([
      ["FLX-export", "Un export nocturne."],
      ["RG-a", "Une règle."],
    ]);

    store.referentiel.set(
      referentiel({
        architecture: new Map([["FLX-export", document("FLX-export", "flux")]]),
        cadrages: new Map([["2026-001", c]]),
      }),
    );

    const lignes = store.listCiblesByCadrage(c);
    expect(lignes.map((l) => l.enonce)).toEqual([
      "Un export nocturne.",
      "Une règle.",
    ]);
    // La cible résolue accompagne l'énoncé : sans elle, la fiche ne pourrait pas
    // signaler qu'un énoncé diverge de ce que la cible porte aujourd'hui.
    expect(lignes[0].cible?.id).toBe("FLX-export");
  });

  it("ne confond pas une règle et une cible d’architecture de même identifiant", () => {
    store.referentiel.set(
      referentiel({
        cadrages: new Map([
          [
            "2026-001",
            cadrage("2026-001", [
              // Rien n'interdit qu'un identifiant se retrouve des deux côtés :
              // la nature est ce qui les sépare, pas le nom.
              { cible: "X", nature: "regle", operation: "cree", regle: "X" },
              { cible: "X", nature: "adr", operation: "modifie", regle: "" },
            ]),
          ],
        ]),
      }),
    );

    expect(
      store.listCadragesImpactantCible("X", "adr").map((c) => c.operation),
    ).toEqual(["modifie"]);
    expect(
      store.listCadragesImpactantCible("X", "regle").map((c) => c.operation),
    ).toEqual(["cree"]);
  });
});
