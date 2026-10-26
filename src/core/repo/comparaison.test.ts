import { describe, expect, it } from "vitest";
import {
  compareRules,
  listScopingsDeliveredBetween,
} from "./comparaison.service";
import {
  Scoping,
  Specification,
  Rule,
  ScopingStatus,
  DEFAULT_LINK_TAGS,
} from "../model/model";

/**
 * La comparaison répond à « qu'a fait ce trimestre ? », pas « qu'existe-t-il ? ».
 * Une règle inchangée ne doit donc produire aucune entrée : lister l'immobile
 * noierait ce qui a bougé, et c'est ce qui a bougé qu'on est venu chercher.
 */
function rule(
  id: string,
  statement: string,
  status: "actif" | "abroge" = "actif",
): Rule {
  return {
    id,
    features: ["f"],
    status,
    statement,
    createdBy: null,
    modifiedBy: [],
  } as Rule;
}

function scoping(id: string, status: ScopingStatus): Scoping {
  return {
    id,
    status: status,
    impacts: [],
    statements: new Map(),
  } as unknown as Scoping;
}

/**
 * Réglages qu'un projet obtient sans rien déclarer.
 *
 * Nommés une fois : ces tests portent sur la comparaison, non sur les réglages,
 * et chaque champ ajouté à `ReglagesProjet` les cassait un à un.
 */
const MINIMAL_SETTINGS = {
  access: "jeton_personnel",
  identity: null,
  tokenProtection: "proposee",
  linkTags: DEFAULT_LINK_TAGS,
} as const;

function specification(rules: Rule[], scopings: Scoping[] = []): Specification {
  return {
    project: { name: "test", description: "", codeRepos: [], prefix: null },
    settings: MINIMAL_SETTINGS,
    domains: new Map(),
    features: new Map(),
    rules: new Map(rules.map((r) => [r.id, r])),
    decisions: new Map(),
    architecture: new Map(),
    scopings: new Map(scopings.map((c) => [c.id, c])),
    anomalies: [],
  };
}

describe("comparaison de deux états du référentiel", () => {
  it("ignore une règle dont l’énoncé n’a pas bougé", () => {
    const before = specification([rule("RG-a", "texte")]);
    const after = specification([rule("RG-a", "texte")]);

    expect(compareRules(before, after)).toEqual([]);
  });

  it("ne retient pas une différence d’espaces en fin de texte", () => {
    // le format ajoute une ligne vide finale à l'écriture : la propagation
    // produirait sinon une modification à chaque exécution
    const before = specification([rule("RG-a", "texte")]);
    const after = specification([rule("RG-a", "texte\n")]);

    expect(compareRules(before, after)).toEqual([]);
  });

  it("signale une règle apparue", () => {
    const before = specification([]);
    const after = specification([rule("RG-a", "texte")]);

    const [gap] = compareRules(before, after);
    expect(gap.evolution).toBe("ajoutee");
    expect(gap.before).toBeNull();
  });

  it("signale une règle dont l’énoncé a changé", () => {
    const before = specification([rule("RG-a", "ancien")]);
    const after = specification([rule("RG-a", "nouveau")]);

    const [gap] = compareRules(before, after);
    expect(gap.evolution).toBe("modifiee");
    expect(gap.before?.statement).toBe("ancien");
    expect(gap.after?.statement).toBe("nouveau");
  });

  it("préfère l’abrogation à la modification quand les deux surviennent", () => {
    // une abrogation réécrit presque toujours l'énoncé pour dire pourquoi :
    // rapporter « modifiée » masquerait le changement de plus grande portée
    const before = specification([rule("RG-a", "ancien")]);
    const after = specification([rule("RG-a", "ne s’applique plus", "abroge")]);

    expect(compareRules(before, after)[0].evolution).toBe("abrogee");
  });

  it("signale une règle disparue, bien que ce soit une anomalie", () => {
    const before = specification([rule("RG-a", "texte")]);
    const after = specification([]);

    const [gap] = compareRules(before, after);
    expect(gap.evolution).toBe("retiree");
    expect(gap.after).toBeNull();
  });

  it("trie les écarts par identifiant, indépendamment de leur nature", () => {
    const before = specification([rule("RG-z", "ancien")]);
    const after = specification([
      rule("RG-a", "neuf"),
      rule("RG-z", "nouveau"),
    ]);

    expect(compareRules(before, after).map((e) => e.id)).toEqual([
      "RG-a",
      "RG-z",
    ]);
  });
});

describe("cadrages livrés entre deux bornes", () => {
  it("retient un cadrage passé à livré", () => {
    const before = specification([], [scoping("2026-001", "en_relecture")]);
    const after = specification([], [scoping("2026-001", "livree")]);

    expect(listScopingsDeliveredBetween(before, after)).toEqual(["2026-001"]);
  });

  it("ignore un cadrage déjà livré à la borne de départ", () => {
    const before = specification([], [scoping("2026-001", "livree")]);
    const after = specification([], [scoping("2026-001", "livree")]);

    expect(listScopingsDeliveredBetween(before, after)).toEqual([]);
  });

  it("retient un cadrage apparu et livré dans l’intervalle", () => {
    const before = specification([], []);
    const after = specification([], [scoping("2026-002", "livree")]);

    expect(listScopingsDeliveredBetween(before, after)).toEqual(["2026-002"]);
  });

  it("ignore un cadrage apparu mais non livré", () => {
    const before = specification([], []);
    const after = specification([], [scoping("2026-002", "brouillon")]);

    expect(listScopingsDeliveredBetween(before, after)).toEqual([]);
  });
});
