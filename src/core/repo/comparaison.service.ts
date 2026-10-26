import { inject } from "../injection";
import { CommitDate, GithubClient, RepoRef } from "../github/github-client";
import { RepoLoader } from "./repo-loader";
import { Specification, Rule } from "../model/model";

/** Ce qui est arrivé à une règle entre deux dates. */
export type Evolution = "ajoutee" | "modifiee" | "abrogee" | "retiree";

export interface ComparedRule {
  readonly id: string;
  readonly evolution: Evolution;
  /** État à la date de départ. Absent si la règle n'existait pas encore. */
  readonly before: Rule | null;
  /** État à la date d'arrivée. Absent si la règle a disparu du référentiel. */
  readonly after: Rule | null;
}

export interface Comparison {
  readonly departure: ComparisonBound;
  readonly arrival: ComparisonBound;
  readonly rules: readonly ComparedRule[];
  /** Cadrages livrés entre les deux bornes, qui expliquent les écarts. */
  readonly deliveredScopings: readonly string[];
}

export interface ComparisonBound {
  readonly date: Date;
  readonly commit: CommitDate;
  readonly specification: Specification;
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
export class ComparisonService {
  private readonly github = inject(GithubClient);
  private readonly loader = inject(RepoLoader);

  async compare(
    repoRef: RepoRef,
    departure: Date,
    arrival: Date,
  ): Promise<Comparison> {
    // Les deux bornes se chargent de front : elles ne dépendent pas l'une de
    // l'autre, et la file d'attente de la couche d'accès borne déjà la charge.
    const [a, b] = await Promise.all([
      this.loadBound(repoRef, departure),
      this.loadBound(repoRef, arrival),
    ]);

    return {
      departure: a,
      arrival: b,
      rules: compareRules(a.specification, b.specification),
      deliveredScopings: listScopingsDeliveredBetween(
        a.specification,
        b.specification,
      ),
    };
  }

  private async loadBound(
    repoRef: RepoRef,
    date: Date,
  ): Promise<ComparisonBound> {
    const commit = await this.github.commitAtDate(repoRef, date);
    if (!commit) {
      throw new Error(
        `Le dépôt n’a aucun enregistrement au ${date.toLocaleDateString("fr-FR")} : ` +
          "cette date précède sa création.",
      );
    }
    const specification = await this.loader.loadSpecification({
      ...repoRef,
      ref: commit.sha,
    });
    return { date, commit, specification };
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
export function compareRules(
  before: Specification,
  after: Specification,
): ComparedRule[] {
  const out: ComparedRule[] = [];

  for (const [id, ruleAfter] of after.rules) {
    const ruleBefore = before.rules.get(id);

    if (!ruleBefore) {
      out.push({ id, evolution: "ajoutee", before: null, after: ruleAfter });
      continue;
    }
    // L'abrogation prime sur la modification : c'est le changement dont la
    // portée est la plus grande, et il s'accompagne presque toujours d'une
    // réécriture de l'énoncé qui masquerait le reste.
    if (ruleBefore.status !== "abroge" && ruleAfter.status === "abroge") {
      out.push({
        id,
        evolution: "abrogee",
        before: ruleBefore,
        after: ruleAfter,
      });
      continue;
    }
    if (ruleBefore.statement.trim() !== ruleAfter.statement.trim()) {
      out.push({
        id,
        evolution: "modifiee",
        before: ruleBefore,
        after: ruleAfter,
      });
    }
  }

  // Une règle disparue est une anomalie — un chemin ne se renomme jamais et un
  // fichier de règle ne se supprime pas — mais la taire priverait le lecteur du
  // seul signal qu'il en a.
  for (const [id, ruleBefore] of before.rules) {
    if (!after.rules.has(id)) {
      out.push({ id, evolution: "retiree", before: ruleBefore, after: null });
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
export function listScopingsDeliveredBetween(
  before: Specification,
  after: Specification,
): string[] {
  const out: string[] = [];
  for (const [id, scoping] of after.scopings) {
    if (scoping.status !== "livree") continue;
    if (before.scopings.get(id)?.status !== "livree") out.push(id);
  }
  return out.sort();
}
