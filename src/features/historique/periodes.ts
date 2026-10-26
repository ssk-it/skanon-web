import type { RefDepot } from "../../core/github/github-client";

/**
 * Les périodes que l'Évolution propose d'un geste — RG-periode-par-defaut.
 *
 * `libre` laisse choisir les deux dates ; les autres se calculent depuis maintenant.
 */
export type Periode = "7-jours" | "visite" | "30-jours" | "3-mois" | "libre";

const JOUR = 86_400_000;

const RECUL_JOURS: Partial<Record<Periode, number>> = {
  "7-jours": 7,
  "30-jours": 30,
  "3-mois": 90,
};

/**
 * Le début d'une période, ou `null` quand elle ne se calcule pas : dates libres, ou dernière visite inconnue.
 */
export function debutPeriode(
  periode: Periode,
  maintenant: Date,
  visite: Date | null,
): Date | null {
  if (periode === "visite") return visite;
  const jours = RECUL_JOURS[periode];
  return jours === undefined
    ? null
    : new Date(maintenant.getTime() - jours * JOUR);
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
export class DerniereVisite {
  consulter(depot: RefDepot, maintenant: Date = new Date()): Date | null {
    const cle = `pc-evolution-visite:${depot.owner}/${depot.repo}`;
    try {
      const retenue = sessionStorage.getItem(cle);
      if (retenue !== null) return retenue ? new Date(retenue) : null;

      const precedente = localStorage.getItem(cle);
      sessionStorage.setItem(cle, precedente ?? "");
      localStorage.setItem(cle, maintenant.toISOString());
      return precedente ? new Date(precedente) : null;
    } catch {
      return null;
    }
  }
}
