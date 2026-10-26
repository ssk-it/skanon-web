import { inject } from "../injection";
import { effect, signal } from "../signals";
import type { RouteLocationNormalized, Router } from "vue-router";
import { SpecificationStore } from "./specification.store";
import { displayIdentifier } from "./scoping-reference";

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
export class TitleStrategy {
  private readonly store = inject(SpecificationStore);

  /** Le dernier état de route connu, pour recomposer sans navigation. */
  private readonly currentState = signal<RouteLocationNormalized | null>(null);

  constructor() {
    // Le référentiel se charge après la navigation : sans cette reprise, le
    // titre resterait sur son repli — « ssk-it/projet » au lieu du nom, et
    // l'identifiant seul au lieu du titre du cadrage. C'est le dernier état
    // que l'historique retient, donc celui qui doit être le bon.
    effect(() => {
      this.store.specification();
      const state = this.currentState();
      if (state) document.title = this.compose(state);
    });
  }

  /** Suit les navigations du routeur : le titre se recompose à chacune. */
  attach(router: Router): void {
    router.afterEach((state) => this.updateTitle(state));
  }

  updateTitle(state: RouteLocationNormalized): void {
    this.currentState.set(state);
    document.title = this.compose(state);
  }

  private compose(state: RouteLocationNormalized): string {
    const segments = [this.element(state), this.project(state)].filter(
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
  private project(state: RouteLocationNormalized): string | null {
    const name = this.store.specification().project.name;
    // « Projet » est le nom par défaut d'un dépôt qui n'en déclare aucun : il
    // ne distingue rien, et le dépôt vaut mieux.
    if (name && name !== "Projet") return name;

    // Le dépôt est lu dans l'adresse et non dans la configuration : l'adresse
    // le porte dès la navigation, là où la configuration n'est mise à jour que
    // par le garde de route — le titre afficherait alors le dépôt précédent le
    // temps que celui-ci s'exécute.
    return repoFromAddress(state);
  }

  /**
   * Ce qui est consulté : l'élément désigné, ou l'intitulé de la route.
   *
   * Un élément dont le référentiel n'est pas encore chargé se donne par son
   * identifiant seul — c'est déjà ce qui le distingue, et l'attendre laisserait
   * un titre générique dans l'historique si l'utilisateur quitte la page avant.
   */
  private element(state: RouteLocationNormalized): string | null {
    const id =
      typeof state.params["id"] === "string" ? state.params["id"] : null;
    const path = fullPath(state);

    if (!id)
      return routeHeading(leaf(state)?.meta["title"] as string | undefined);

    const prefix = this.store.specification().project.prefix;
    const shown = displayIdentifier(id, prefix);

    // Un titre fait davantage que nommer : il doit se retrouver dans une liste
    // d'historique. Le titre du cadrage, du domaine ou de la fonctionnalité y
    // sert mieux que l'identifiant seul, quand il existe.
    const label = this.labelOf(path, id);
    return label ? `${shown} ${label}` : shown;
  }

  private labelOf(path: string, id: string): string | null {
    if (path.includes("/cadrages/")) {
      return this.store.specification().scopings.get(id)?.title ?? null;
    }
    if (path.includes("/domaine/")) {
      return this.store.specification().domains.get(id)?.name ?? null;
    }
    if (path.includes("/fonctionnalite/")) {
      return this.store.specification().features.get(id)?.name ?? null;
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
function repoFromAddress(state: RouteLocationNormalized): string | null {
  const segments = state.path.split("/").filter(Boolean);
  return segments.length >= 2 ? `${segments[0]}/${segments[1]}` : null;
}

/** La route affichée, au bout de la branche activée. */
function leaf(state: RouteLocationNormalized) {
  return state.matched[state.matched.length - 1];
}

/** Le chemin complet de la route, segments de toutes les branches réunis. */
function fullPath(state: RouteLocationNormalized): string {
  return state.path;
}

/**
 * L'intitulé déclaré par la route, débarrassé du nom de l'application.
 *
 * Les routes le portent en suffixe depuis toujours ; le recomposer ici
 * l'ajouterait deux fois.
 */
function routeHeading(title: string | undefined): string | null {
  if (!title) return null;
  const withoutSuffix = title.replace(
    new RegExp(`\\s*—\\s*${APPLICATION}\\s*$`),
    "",
  );
  return withoutSuffix || null;
}
