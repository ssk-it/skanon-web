import { inject } from "../injection";
import { effect, signal } from "../signaux";
import type { RouteLocationNormalized, Router } from "vue-router";
import { ReferentielStore } from "./referentiel.store";
import { afficherIdentifiant } from "./reference-cadrage";

/** Ce qui suit tout titre : l'application, pour qu'on la reconnaisse. */
export const APPLICATION = "Skanon";

/**
 * Compose le titre de la page à partir de la route et du référentiel chargé.
 *
 * Les titres déclarés dans les routes sont les mêmes pour tous les projets et
 * tous les éléments : « Règle de gestion — SSK Canon » ne dit ni sur quel dépôt
 * on travaille, ni quelle règle on regarde. L'historique du navigateur, qui ne
 * retient que le titre, devient alors inexploitable — une dizaine d'entrées
 * identiques pour autant de pages différentes.
 *
 * Le titre porte donc trois choses, de la plus précise à la plus générale :
 * l'élément consulté, le projet, l'application. C'est l'ordre qui survit à la
 * troncature d'un onglet ou d'une entrée d'historique : ce qui distingue vient
 * d'abord, ce qui est commun à tout ensuite.
 */
export class TitreStrategy {
  private readonly store = inject(ReferentielStore);

  /** Le dernier état de route connu, pour recomposer sans navigation. */
  private readonly etatCourant = signal<RouteLocationNormalized | null>(null);

  constructor() {
    // Le référentiel se charge après la navigation : sans cette reprise, le
    // titre resterait sur son repli — « ssk-it/projet » au lieu du nom, et
    // l'identifiant seul au lieu du titre du cadrage. C'est le dernier état
    // que l'historique retient, donc celui qui doit être le bon.
    effect(() => {
      this.store.referentiel();
      const etat = this.etatCourant();
      if (etat) document.title = this.composer(etat);
    });
  }

  /** Suit les navigations du routeur : le titre se recompose à chacune. */
  attach(routeur: Router): void {
    routeur.afterEach((etat) => this.updateTitle(etat));
  }

  updateTitle(etat: RouteLocationNormalized): void {
    this.etatCourant.set(etat);
    document.title = this.composer(etat);
  }

  private composer(etat: RouteLocationNormalized): string {
    const segments = [this.element(etat), this.projet(etat)].filter(
      (segment): segment is string => !!segment,
    );
    return [...segments, APPLICATION].join(" — ");
  }

  /**
   * Le projet, nommé s'il l'est.
   *
   * Le nom lisible vient du référentiel et n'existe qu'une fois celui-ci
   * chargé ; `owner/repo` vient de l'adresse et est là dès la navigation. Le
   * repli garantit qu'aucun titre ne reste muet pendant le chargement, et le
   * titre se précise quand le nom arrive — c'est ce dernier état que
   * l'historique retient.
   */
  private projet(etat: RouteLocationNormalized): string | null {
    const nom = this.store.referentiel().projet.nom;
    // « Projet » est le nom par défaut d'un dépôt qui n'en déclare aucun : il
    // ne distingue rien, et le dépôt vaut mieux.
    if (nom && nom !== "Projet") return nom;

    // Le dépôt est lu dans l'adresse et non dans la configuration : l'adresse
    // le porte dès la navigation, là où la configuration n'est mise à jour que
    // par le garde de route — le titre afficherait alors le dépôt précédent le
    // temps que celui-ci s'exécute.
    return depotDeLAdresse(etat);
  }

  /**
   * Ce qui est consulté : l'élément désigné, ou l'intitulé de la route.
   *
   * Un élément dont le référentiel n'est pas encore chargé se donne par son
   * identifiant seul — c'est déjà ce qui le distingue, et l'attendre laisserait
   * un titre générique dans l'historique si l'utilisateur quitte la page avant.
   */
  private element(etat: RouteLocationNormalized): string | null {
    const id = typeof etat.params["id"] === "string" ? etat.params["id"] : null;
    const chemin = cheminComplet(etat);

    if (!id)
      return intituleDeRoute(
        feuille(etat)?.meta["title"] as string | undefined,
      );

    const prefixe = this.store.referentiel().projet.prefixe;
    const affiche = afficherIdentifiant(id, prefixe);

    // Un titre fait davantage que nommer : il doit se retrouver dans une liste
    // d'historique. Le titre du cadrage, du domaine ou de la fonctionnalité y
    // sert mieux que l'identifiant seul, quand il existe.
    const libelle = this.libelleDe(chemin, id);
    return libelle ? `${affiche} ${libelle}` : affiche;
  }

  private libelleDe(chemin: string, id: string): string | null {
    if (chemin.includes("/cadrages/")) {
      return this.store.referentiel().cadrages.get(id)?.titre ?? null;
    }
    if (chemin.includes("/domaine/")) {
      return this.store.referentiel().domaines.get(id)?.nom ?? null;
    }
    if (chemin.includes("/fonctionnalite/")) {
      return this.store.referentiel().fonctionnalites.get(id)?.nom ?? null;
    }
    // Règles, décisions et documents d'architecture n'ont pas d'autre nom que
    // leur identifiant : il se suffit.
    return null;
  }
}

/**
 * Le dépôt que porte l'adresse, sous la forme « owner/repo ».
 *
 * Toute vue d'un projet vit sous `/:owner/:repo/` : les deux premiers segments
 * suffisent, et ils sont connus avant tout chargement.
 */
function depotDeLAdresse(etat: RouteLocationNormalized): string | null {
  const segments = etat.path.split("/").filter(Boolean);
  return segments.length >= 2 ? `${segments[0]}/${segments[1]}` : null;
}

/** La route affichée, au bout de la branche activée. */
function feuille(etat: RouteLocationNormalized) {
  return etat.matched[etat.matched.length - 1];
}

/** Le chemin complet de la route, segments de toutes les branches réunis. */
function cheminComplet(etat: RouteLocationNormalized): string {
  return etat.path;
}

/**
 * L'intitulé déclaré par la route, débarrassé du nom de l'application.
 *
 * Les routes le portent en suffixe depuis toujours ; le recomposer ici
 * l'ajouterait deux fois.
 */
function intituleDeRoute(titre: string | undefined): string | null {
  if (!titre) return null;
  const sansSuffixe = titre.replace(
    new RegExp(`\\s*—\\s*${APPLICATION}\\s*$`),
    "",
  );
  return sansSuffixe || null;
}
