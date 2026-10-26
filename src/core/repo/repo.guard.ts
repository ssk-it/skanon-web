import { inject } from "../injection";
import type { NavigationGuard } from "vue-router";
import { SpecificationStore } from "./specification.store";
import { RepoConfig, sameRepo } from "./repo-config";

/**
 * Ouvre le dépôt que porte l'adresse.
 *
 * L'URL fait autorité, non la mémoire du navigateur : une adresse partagée doit
 * montrer le même projet chez celui qui la reçoit. Le chargement n'est pas
 * attendu — les vues savent afficher leur état — mais il est lancé avant elles,
 * sans quoi chaque page devrait le déclencher elle-même.
 */
export const repoGuard: NavigationGuard = (to) => {
  const owner =
    typeof to.params["owner"] === "string" ? to.params["owner"] : null;
  const repo = typeof to.params["repo"] === "string" ? to.params["repo"] : null;

  if (!owner || !repo) return "/";

  const config = inject(RepoConfig);
  const store = inject(SpecificationStore);
  const request = { owner, repo };

  // Rechargé seulement si le dépôt change : sans ce contrôle, naviguer d'une
  // vue à l'autre du même projet rejouerait cinquante-huit lectures.
  if (!sameRepo(config.repoRef(), request) || store.state() === "vide") {
    void store.loadSpecification(request);
  }

  return true;
};
