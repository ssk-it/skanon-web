import { describe, expect, it } from "vitest";
import { comparerRegles, listCadragesLivresEntre } from "./comparaison.service";
import {
  Cadrage,
  Referentiel,
  Regle,
  StatutCadrage,
  TAGS_LIENS_PAR_DEFAUT,
} from "../model/model";

/**
 * La comparaison répond à « qu'a fait ce trimestre ? », pas « qu'existe-t-il ? ».
 * Une règle inchangée ne doit donc produire aucune entrée : lister l'immobile
 * noierait ce qui a bougé, et c'est ce qui a bougé qu'on est venu chercher.
 */
function regle(
  id: string,
  enonce: string,
  statut: "actif" | "abroge" = "actif",
): Regle {
  return {
    id,
    fonctionnalites: ["f"],
    statut,
    enonce,
    creePar: null,
    modifiePar: [],
  } as Regle;
}

function cadrage(id: string, statut: StatutCadrage): Cadrage {
  return { id, statut, impacts: [], enonces: new Map() } as unknown as Cadrage;
}

/**
 * Réglages qu'un projet obtient sans rien déclarer.
 *
 * Nommés une fois : ces tests portent sur la comparaison, non sur les réglages,
 * et chaque champ ajouté à `ReglagesProjet` les cassait un à un.
 */
const REGLAGES_MINIMAUX = {
  acces: "jeton_personnel",
  identite: null,
  protectionDuJeton: "proposee",
  tagsLiens: TAGS_LIENS_PAR_DEFAUT,
} as const;

function referentiel(regles: Regle[], cadrages: Cadrage[] = []): Referentiel {
  return {
    projet: { nom: "test", description: "", depotsCode: [], prefixe: null },
    reglages: REGLAGES_MINIMAUX,
    domaines: new Map(),
    fonctionnalites: new Map(),
    regles: new Map(regles.map((r) => [r.id, r])),
    decisions: new Map(),
    architecture: new Map(),
    cadrages: new Map(cadrages.map((c) => [c.id, c])),
    anomalies: [],
  };
}

describe("comparaison de deux états du référentiel", () => {
  it("ignore une règle dont l’énoncé n’a pas bougé", () => {
    const avant = referentiel([regle("RG-a", "texte")]);
    const apres = referentiel([regle("RG-a", "texte")]);

    expect(comparerRegles(avant, apres)).toEqual([]);
  });

  it("ne retient pas une différence d’espaces en fin de texte", () => {
    // le format ajoute une ligne vide finale à l'écriture : la propagation
    // produirait sinon une modification à chaque exécution
    const avant = referentiel([regle("RG-a", "texte")]);
    const apres = referentiel([regle("RG-a", "texte\n")]);

    expect(comparerRegles(avant, apres)).toEqual([]);
  });

  it("signale une règle apparue", () => {
    const avant = referentiel([]);
    const apres = referentiel([regle("RG-a", "texte")]);

    const [ecart] = comparerRegles(avant, apres);
    expect(ecart.evolution).toBe("ajoutee");
    expect(ecart.avant).toBeNull();
  });

  it("signale une règle dont l’énoncé a changé", () => {
    const avant = referentiel([regle("RG-a", "ancien")]);
    const apres = referentiel([regle("RG-a", "nouveau")]);

    const [ecart] = comparerRegles(avant, apres);
    expect(ecart.evolution).toBe("modifiee");
    expect(ecart.avant?.enonce).toBe("ancien");
    expect(ecart.apres?.enonce).toBe("nouveau");
  });

  it("préfère l’abrogation à la modification quand les deux surviennent", () => {
    // une abrogation réécrit presque toujours l'énoncé pour dire pourquoi :
    // rapporter « modifiée » masquerait le changement de plus grande portée
    const avant = referentiel([regle("RG-a", "ancien")]);
    const apres = referentiel([regle("RG-a", "ne s’applique plus", "abroge")]);

    expect(comparerRegles(avant, apres)[0].evolution).toBe("abrogee");
  });

  it("signale une règle disparue, bien que ce soit une anomalie", () => {
    const avant = referentiel([regle("RG-a", "texte")]);
    const apres = referentiel([]);

    const [ecart] = comparerRegles(avant, apres);
    expect(ecart.evolution).toBe("retiree");
    expect(ecart.apres).toBeNull();
  });

  it("trie les écarts par identifiant, indépendamment de leur nature", () => {
    const avant = referentiel([regle("RG-z", "ancien")]);
    const apres = referentiel([
      regle("RG-a", "neuf"),
      regle("RG-z", "nouveau"),
    ]);

    expect(comparerRegles(avant, apres).map((e) => e.id)).toEqual([
      "RG-a",
      "RG-z",
    ]);
  });
});

describe("cadrages livrés entre deux bornes", () => {
  it("retient un cadrage passé à livré", () => {
    const avant = referentiel([], [cadrage("2026-001", "en_relecture")]);
    const apres = referentiel([], [cadrage("2026-001", "livree")]);

    expect(listCadragesLivresEntre(avant, apres)).toEqual(["2026-001"]);
  });

  it("ignore un cadrage déjà livré à la borne de départ", () => {
    const avant = referentiel([], [cadrage("2026-001", "livree")]);
    const apres = referentiel([], [cadrage("2026-001", "livree")]);

    expect(listCadragesLivresEntre(avant, apres)).toEqual([]);
  });

  it("retient un cadrage apparu et livré dans l’intervalle", () => {
    const avant = referentiel([], []);
    const apres = referentiel([], [cadrage("2026-002", "livree")]);

    expect(listCadragesLivresEntre(avant, apres)).toEqual(["2026-002"]);
  });

  it("ignore un cadrage apparu mais non livré", () => {
    const avant = referentiel([], []);
    const apres = referentiel([], [cadrage("2026-002", "brouillon")]);

    expect(listCadragesLivresEntre(avant, apres)).toEqual([]);
  });
});
