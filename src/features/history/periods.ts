import type { RepoRef } from "../../core/github/github-client";

/**
 * Les périodes que l'Évolution propose d'un geste — RG-periode-par-defaut.
 *
 * `libre` laisse choisir les deux dates ; les autres se calculent depuis maintenant.
 */
export type Period = "7-jours" | "visite" | "30-jours" | "3-mois" | "libre";

const DAY = 86_400_000;

const LOOKBACK_DAYS: Partial<Record<Period, number>> = {
  "7-jours": 7,
  "30-jours": 30,
  "3-mois": 90,
};

/**
 * Le début d'une période, ou `null` quand elle ne se calcule pas : dates libres, ou dernière visite inconnue.
 */
export function periodStart(
  period: Period,
  now: Date,
  visit: Date | null,
): Date | null {
  if (period === "visite") return visit;
  const days = LOOKBACK_DAYS[period];
  return days === undefined ? null : new Date(now.getTime() - days * DAY);
}

/**
 * La date de la visite précédente, par projet, sur ce poste.
 *
 * Elle est propre au lecteur : la tenir dans le dépôt ferait d'une habitude personnelle un fait partagé (2026-044, décision 04). Elle se perd avec le poste, ce qui ne coûte qu'une période de trente jours, non une erreur.
 *
 * **Figée pour la session.** Enregistrer la visite courante à chaque ouverture ramènerait la période à une minute au premier rechargement. La visite précédente est donc lue une fois, retenue pour la session, et c'est seulement alors que la visite courante la remplace pour la fois suivante.
 *
 * Le stockage du navigateur peut manquer ou refuser : la vue retombe alors sur trente jours, sans rien perdre d'autre.
 */
export class LastVisit {
  visit(repoRef: RepoRef, now: Date = new Date()): Date | null {
    const key = `pc-evolution-visite:${repoRef.owner}/${repoRef.repo}`;
    try {
      const chosen = sessionStorage.getItem(key);
      if (chosen !== null) return chosen ? new Date(chosen) : null;

      const previous = localStorage.getItem(key);
      sessionStorage.setItem(key, previous ?? "");
      localStorage.setItem(key, now.toISOString());
      return previous ? new Date(previous) : null;
    } catch {
      return null;
    }
  }
}
