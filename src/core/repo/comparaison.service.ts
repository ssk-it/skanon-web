import { inject } from "../injection";
import { CommitDate, GithubClient, RefDepot } from "../github/github-client";
import { RepoLoader } from "./repo-loader";
import { Referentiel, Regle } from "../model/model";

/** Ce qui est arrivé à une règle entre deux dates. */
export type Evolution = "ajoutee" | "modifiee" | "abrogee" | "retiree";

export interface RegleComparee {
  readonly id: string;
  readonly evolution: Evolution;
  /** État à la date de départ. Absent si la règle n'existait pas encore. */
  readonly avant: Regle | null;
  /** État à la date d'arrivée. Absent si la règle a disparu du référentiel. */
  readonly apres: Regle | null;
}

export interface Comparaison {
  readonly depart: BorneComparaison;
  readonly arrivee: BorneComparaison;
  readonly regles: readonly RegleComparee[];
  /** Cadrages livrés entre les deux bornes, qui expliquent les écarts. */
  readonly cadragesLivres: readonly string[];
}

export interface BorneComparaison {
  readonly date: Date;
  readonly commit: CommitDate;
  readonly referentiel: Referentiel;
}

/**
 * Comparaison du référentiel entre deux dates.
 *
 * Chaque borne se reconstitue en deux appels décomptés : un pour résoudre la
 * date en commit, un pour l'arborescence à ce commit. Les contenus sont servis
 * hors quota, y compris adressés par un commit passé — mesuré, c'est ce qui rend
 * l'opération abordable quelle que soit la taille du référentiel.
 *
 * La comparaison porte sur les règles de gestion, et non sur les fonctionnalités
 * ou les domaines : ce sont elles qui portent le comportement du produit, et
 * elles seules qu'un cadrage prétend transformer.
 */
export class ComparaisonService {
  private readonly github = inject(GithubClient);
  private readonly loader = inject(RepoLoader);

  async comparer(
    depot: RefDepot,
    depart: Date,
    arrivee: Date,
  ): Promise<Comparaison> {
    // Les deux bornes se chargent de front : elles ne dépendent pas l'une de
    // l'autre, et la file d'attente de la couche d'accès borne déjà la charge.
    const [a, b] = await Promise.all([
      this.loadBorne(depot, depart),
      this.loadBorne(depot, arrivee),
    ]);

    return {
      depart: a,
      arrivee: b,
      regles: comparerRegles(a.referentiel, b.referentiel),
      cadragesLivres: listCadragesLivresEntre(a.referentiel, b.referentiel),
    };
  }

  private async loadBorne(
    depot: RefDepot,
    date: Date,
  ): Promise<BorneComparaison> {
    const commit = await this.github.commitALaDate(depot, date);
    if (!commit) {
      throw new Error(
        `Le dépôt n’a aucun enregistrement au ${date.toLocaleDateString("fr-FR")} : ` +
          "cette date précède sa création.",
      );
    }
    const referentiel = await this.loader.loadReferentiel({
      ...depot,
      ref: commit.sha,
    });
    return { date, commit, referentiel };
  }
}

/**
 * Écarts entre deux états du référentiel, règle par règle.
 *
 * Une règle inchangée ne produit aucune entrée : la comparaison répond à « qu'a
 * fait ce trimestre ? », pas « qu'existe-t-il ? ». Lister l'immobile noierait ce
 * qui a bougé.
 *
 * Fonction libre plutôt que méthode : elle ne dépend d'aucune injection, et
 * l'éprouver ne doit pas demander de construire un service.
 */
export function comparerRegles(
  avant: Referentiel,
  apres: Referentiel,
): RegleComparee[] {
  const out: RegleComparee[] = [];

  for (const [id, regleApres] of apres.regles) {
    const regleAvant = avant.regles.get(id);

    if (!regleAvant) {
      out.push({ id, evolution: "ajoutee", avant: null, apres: regleApres });
      continue;
    }
    // L'abrogation prime sur la modification : c'est le changement dont la
    // portée est la plus grande, et il s'accompagne presque toujours d'une
    // réécriture de l'énoncé qui masquerait le reste.
    if (regleAvant.statut !== "abroge" && regleApres.statut === "abroge") {
      out.push({
        id,
        evolution: "abrogee",
        avant: regleAvant,
        apres: regleApres,
      });
      continue;
    }
    if (regleAvant.enonce.trim() !== regleApres.enonce.trim()) {
      out.push({
        id,
        evolution: "modifiee",
        avant: regleAvant,
        apres: regleApres,
      });
    }
  }

  // Une règle disparue est une anomalie — un chemin ne se renomme jamais et un
  // fichier de règle ne se supprime pas — mais la taire priverait le lecteur du
  // seul signal qu'il en a.
  for (const [id, regleAvant] of avant.regles) {
    if (!apres.regles.has(id)) {
      out.push({ id, evolution: "retiree", avant: regleAvant, apres: null });
    }
  }

  return out.sort((a, b) => a.id.localeCompare(b.id));
}

/**
 * Cadrages passés à l'état livré entre les deux bornes.
 *
 * Ce sont eux qui expliquent les écarts : sans ce lien, la comparaison montre
 * que le référentiel a changé sans dire pourquoi, ce qui est exactement le vide
 * que le produit prétend combler.
 */
export function listCadragesLivresEntre(
  avant: Referentiel,
  apres: Referentiel,
): string[] {
  const out: string[] = [];
  for (const [id, cadrage] of apres.cadrages) {
    if (cadrage.statut !== "livree") continue;
    if (avant.cadrages.get(id)?.statut !== "livree") out.push(id);
  }
  return out.sort();
}
