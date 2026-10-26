import { inject } from "../injection";
import { checkRepo } from "@ssk-it/canon-check";
import { SpecificationStore } from "./specification.store";
import {
  Scoping,
  TargetKind,
  ImpactOperation,
  Specification,
} from "../model/model";

/** Ce que le vérificateur lit d'un cadrage : le cadrage saisi, ou un cadrage du référentiel. */
type ScopingEntry = Pick<Scoping, "id" | "domains" | "statements"> & {
  readonly impacts: ScopingInput["impacts"];
};

/** Ce que la vérification rapporte d'un cadrage en cours de rédaction. */
export interface Verdict {
  /** Ce qui empêcherait la livraison. */
  readonly errors: readonly string[];
  /** Ce qui mérite l'attention sans bloquer. */
  readonly warnings: readonly string[];
}

/** Un cadrage tel que saisi, pas encore écrit. */
export interface ScopingInput {
  readonly id: string;
  readonly title: string;
  readonly domains: readonly string[];
  readonly impacts: ReadonlyArray<{
    readonly target: string;
    readonly kind?: TargetKind;
    readonly operation: ImpactOperation;
  }>;
  readonly statements: ReadonlyMap<string, string>;
}

/**
 * Vérification d'intégrité pendant la rédaction.
 *
 * Les règles sont celles de `@ssk-it/canon-check`, le même module que l'Action
 * exécute avant chaque livraison. Il ne dépend d'aucun système de fichiers :
 * l'Action lui donne un référentiel lu sur disque, l'application lui donne celui
 * qu'elle a chargé. Une seule implémentation, deux moments.
 *
 * **Ce qui reste moins fiable ici qu'en intégration continue.** L'application
 * connaît le référentiel de la branche principale, augmenté du seul cadrage en
 * cours. Un cadrage voisin, ouvert sur une autre branche, lui échappe — les
 * contrôles portant sur les index dérivés ou les règles abrogées peuvent donc
 * conclure moins que la vérification finale.
 *
 * Le désaccord va toujours dans le même sens : l'application signale moins,
 * jamais plus. Ce qu'elle affirme est vrai ; ce qu'elle tait peut encore
 * apparaître à la livraison, où la vérification reste l'autorité.
 */
export class VerificationService {
  private readonly store = inject(SpecificationStore);

  /**
   * Vérifie le référentiel tel qu'il serait avec ce cadrage.
   *
   * Le cadrage saisi remplace sa version enregistrée : c'est bien l'effet de ce
   * qu'on est en train d'écrire qu'on veut mesurer, pas celui de ce qui est
   * déjà dans le dépôt.
   */
  checkScoping(input: ScopingInput, context?: Specification): Verdict {
    // Le contexte de la branche éditée, quand il est connu : un cadrage crée
    // souvent le domaine ou les règles qu'il déclare, et ceux-ci n'existent pas
    // encore sur la branche principale. Les ignorer signalerait comme inconnu
    // ce que le cadrage apporte lui-même — un défaut qui n'en est pas un, et
    // que la vérification à la livraison ne relève pas.
    const ref = context ?? this.store.specification();

    const scopings = new Map<string, ScopingEntry>(ref.scopings);
    scopings.set(input.id, {
      id: input.id,
      domains: input.domains,
      impacts: input.impacts,
      statements: input.statements,
    });

    // `ignorerIndexDerives` : `cree_par` et `modifie_par` sont écrits par la
    // propagation, après la livraison. Les exiger corrects pendant la rédaction
    // signalerait comme faute ce que le cadrage n'a pas encore produit.
    const { errors, warnings } = checkRepo(
      {
        domains: ref.domains,
        features: mapValues(ref.features, (f) => ({
          id: f.id,
          domaines: f.domains,
        })),
        rules: mapValues(ref.rules, (r) => ({
          ...derivedIndexes(r),
          fonctionnalites: r.features,
        })),
        // Sans elles, le vérificateur tiendrait toute cible d'architecture pour
        // inconnue : il cherche chaque impact dans la collection que sa nature
        // désigne, et une collection absente se lit comme vide.
        decisions: mapValues(ref.decisions, derivedIndexes),
        architecture: mapValues(ref.architecture, derivedIndexes),
        cadrages: mapValues(scopings, toCheckedScoping),
        errors: [],
      },
      {
        ignorerIndexDerives: true,
        livres: new Set(
          [...ref.scopings.values()]
            .filter((c) => !c.provenance)
            .map((c) => c.id),
        ),
      },
    );

    const concernsIt = (m: string) => m.includes(input.id);
    return {
      errors: errors.filter(concernsIt),
      warnings: warnings.filter(concernsIt),
    };
  }
}

/*
 * Le vérificateur lit les entités sous les noms du format SSK Canon — `domaines`, `statut`, `enonces`, et la clé de chaque impact qui en dit la nature (`regle`, `adr`, `architecture`) —, le modèle les nomme en anglais. La correspondance se fait ici, à un seul endroit : une propriété manquante n'y serait signalée par aucune compilation, seulement par un contrôle qui ne contrôle plus rien.
 */

function mapValues<T, U>(
  map: ReadonlyMap<string, T>,
  convert: (value: T) => U,
): ReadonlyMap<string, U> {
  return new Map([...map].map(([id, value]) => [id, convert(value)]));
}

function derivedIndexes(entry: {
  readonly id: string;
  readonly status: string;
  readonly createdBy: string | null;
  readonly modifiedBy: readonly string[];
}) {
  return {
    id: entry.id,
    statut: entry.status,
    cree_par: entry.createdBy,
    modifie_par: entry.modifiedBy,
  };
}

/** Un cadrage ne déclare pas son statut : le vérificateur refuserait d'en lire un. */
function toCheckedScoping(scoping: ScopingEntry) {
  return {
    id: scoping.id,
    domaines: scoping.domains,
    enonces: scoping.statements,
    impacts: scoping.impacts.map((i) => ({
      [i.kind ?? "regle"]: i.target,
      operation: i.operation,
    })),
  };
}
