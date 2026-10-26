import { inject } from "../injection";
import { checkRepo } from "@ssk-it/canon-check";
import { ReferentielStore } from "./referentiel.store";
import {
  Cadrage,
  NatureCible,
  OperationImpact,
  Referentiel,
} from "../model/model";

/** Ce que la vérification rapporte d'un cadrage en cours de rédaction. */
export interface Verdict {
  /** Ce qui empêcherait la livraison. */
  readonly erreurs: readonly string[];
  /** Ce qui mérite l'attention sans bloquer. */
  readonly avertissements: readonly string[];
}

/** Un cadrage tel que saisi, pas encore écrit. */
export interface CadrageSaisi {
  readonly id: string;
  readonly titre: string;
  readonly domaines: readonly string[];
  readonly impacts: ReadonlyArray<{
    readonly cible: string;
    readonly nature?: NatureCible;
    readonly operation: OperationImpact;
  }>;
  readonly enonces: ReadonlyMap<string, string>;
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
  private readonly store = inject(ReferentielStore);

  /**
   * Vérifie le référentiel tel qu'il serait avec ce cadrage.
   *
   * Le cadrage saisi remplace sa version enregistrée : c'est bien l'effet de ce
   * qu'on est en train d'écrire qu'on veut mesurer, pas celui de ce qui est
   * déjà dans le dépôt.
   */
  verifierCadrage(saisi: CadrageSaisi, contexte?: Referentiel): Verdict {
    // Le contexte de la branche éditée, quand il est connu : un cadrage crée
    // souvent le domaine ou les règles qu'il déclare, et ceux-ci n'existent pas
    // encore sur la branche principale. Les ignorer signalerait comme inconnu
    // ce que le cadrage apporte lui-même — un défaut qui n'en est pas un, et
    // que la vérification à la livraison ne relève pas.
    const ref = contexte ?? this.store.referentiel();

    const cadrages = new Map(ref.cadrages);
    // `statut` est retiré de ce qu'on avait chargé : le vérificateur refuse un
    // statut déclaré, et le modèle de l'application en porte un, déduit. Le lui
    // passer ferait échouer la rédaction sur un champ que le fichier n'a pas.
    const { statut: _ignore, ...existant } =
      cadrages.get(saisi.id) ?? ({} as Partial<Cadrage>);
    cadrages.set(saisi.id, {
      ...existant,
      id: saisi.id,
      titre: saisi.titre,
      domaines: saisi.domaines,
      impacts: saisi.impacts,
      enonces: saisi.enonces,
    } as unknown as Cadrage);

    // `ignorerIndexDerives` : `cree_par` et `modifie_par` sont écrits par la
    // propagation, après la livraison. Les exiger corrects pendant la rédaction
    // signalerait comme faute ce que le cadrage n'a pas encore produit.
    // Le modèle de l'application nomme ses entités en français, le vérificateur
    // en anglais : la correspondance se fait ici, à un seul endroit.
    const { errors, warnings } = checkRepo(
      {
        domains: ref.domaines,
        features: ref.fonctionnalites,
        rules: ref.regles,
        // Sans elles, le vérificateur tiendrait toute cible d'architecture pour
        // inconnue : il cherche chaque impact dans la collection que sa nature
        // désigne, et une collection absente se lit comme vide.
        decisions: ref.decisions,
        architecture: ref.architecture,
        cadrages,
        errors: [],
      },
      // Les cadrages livrés sont ceux que porte la branche principale, que le
      // store distingue par l'absence de provenance. Sans cet ensemble, aucun
      // ne serait tenu pour livré, et une règle créée par un cadrage livré
      // passerait pour manquante.
      {
        ignorerIndexDerives: true,
        livres: new Set(
          [...ref.cadrages.values()]
            .filter((c) => !c.provenance)
            .map((c) => c.id),
        ),
      },
    );

    // Seul ce qui nomme ce cadrage est rapporté : le rédacteur n'est pas
    // responsable d'un défaut ailleurs dans le référentiel, et le lui montrer
    // ici l'empêcherait de distinguer ce qu'il doit corriger.
    const leSien = (m: string) => m.includes(saisi.id);
    return {
      erreurs: errors.filter(leSien),
      avertissements: warnings.filter(leSien),
    };
  }
}
