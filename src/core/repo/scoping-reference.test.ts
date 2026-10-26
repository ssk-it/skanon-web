import { describe, expect, it } from "vitest";
import {
  resolveScopingReference,
  extractScopingIdentifier,
} from "./scoping-reference";
import type { Scoping } from "../model/model";

/**
 * La résolution d'une référence à un cadrage — RG-reference-par-identifiant.
 *
 * Ce qui est en jeu n'est pas le confort mais la durée de vie du texte : citer
 * l'adresse d'une demande de fusion oblige à repasser la corriger après la
 * livraison, et cet oubli-là est silencieux — le lien continue de fonctionner,
 * mène à une demande close, et rien ne dit qu'une fiche existe.
 */
function scoping(id: string, provenance?: Scoping["provenance"]): Scoping {
  return { id, title: `Cadrage ${id}`, provenance } as unknown as Scoping;
}

const REPO = { owner: "org", repo: "projet" };

describe("résolution d’une référence de cadrage", () => {
  it("mène à la fiche quand le cadrage est livré", () => {
    const target = resolveScopingReference(
      "2026-002",
      [scoping("2026-002")],
      REPO,
    );

    expect(target).toEqual({
      kind: "fiche",
      link: ["/", "org", "projet", "cadrages", "2026-002"],
      label: "2026-002",
    });
  });

  it("mène à la demande de fusion tant que le cadrage ne l’est pas", () => {
    const target = resolveScopingReference(
      "2026-002",
      [
        scoping("2026-002", {
          branch: "cadrage-2026-002",
          pullRequest: 42,
          draft: true,
        }),
      ],
      REPO,
    );

    expect(target).toEqual({
      kind: "demande",
      url: "https://github.com/org/projet/pull/42",
      label: "2026-002",
      inProgress: true,
    });
  });

  it("signale une référence que le dépôt ne porte pas", () => {
    // Un identifiant inconnu n'est pas une erreur de saisie à corriger : le
    // cadrage peut être en cours ailleurs, sur une branche que ce chargement
    // n'a pas vue. Le dire vaut mieux que de fabriquer un lien mort.
    const target = resolveScopingReference(
      "2026-999",
      [scoping("2026-002")],
      REPO,
    );

    expect(target).toEqual({ kind: "inconnu", label: "2026-999" });
  });
});

/**
 * Le préfixe de projet — RG-prefixe-projet.
 *
 * Il s'ajoute à l'affichage et est accepté en entrée, sans rien changer à ce qui
 * est stocké : les identifiants déjà posés dans des issues ou des demandes de
 * fusion restent valides, et c'est tout l'intérêt.
 */
describe("identifiant préfixé", () => {
  it("accepte la forme sans préfixe", () => {
    expect(extractScopingIdentifier("2026-002", "PRMCO")).toBe("2026-002");
  });

  it("accepte la forme préfixée du projet", () => {
    expect(extractScopingIdentifier("PRMCO-2026-002", "PRMCO")).toBe(
      "2026-002",
    );
  });

  it("refuse un préfixe qui n’est pas celui du projet", () => {
    // Un identifiant numériquement valide ne suffit pas : préfixé d'un autre
    // projet, il désigne un cadrage qui n'est pas ici.
    expect(extractScopingIdentifier("AUTRE-2026-002", "PRMCO")).toBeNull();
  });

  it("n’accepte aucun préfixe quand le projet n’en déclare pas", () => {
    expect(extractScopingIdentifier("2026-002", null)).toBe("2026-002");
    expect(extractScopingIdentifier("PRMCO-2026-002", null)).toBeNull();
  });
});
