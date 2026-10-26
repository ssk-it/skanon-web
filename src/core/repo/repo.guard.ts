import { inject } from "../injection";
import type { NavigationGuard } from "vue-router";
import { SpecificationStore } from "./specification.store";
import { RepoConfig, sameRepo } from "./repo-config";

/**
 * Opens the repo the address carries.
 *
 * The URL is authoritative, not the browser's memory: a shared address must
 * show the same project to whoever receives it. Loading is not awaited — the
 * views know how to display their state — but it is started before them,
 * otherwise each page would have to trigger it itself.
 */
export const repoGuard: NavigationGuard = (to) => {
  const owner =
    typeof to.params["owner"] === "string" ? to.params["owner"] : null;
  const repo = typeof to.params["repo"] === "string" ? to.params["repo"] : null;

  if (!owner || !repo) return "/";

  const config = inject(RepoConfig);
  const store = inject(SpecificationStore);
  const request = { owner, repo };

  // Reloaded only if the repo changes: without this check, navigating from
  // one view to another of the same project would replay fifty-eight reads.
  if (!sameRepo(config.repoRef(), request) || store.state() === "vide") {
    void store.loadSpecification(request);
  }

  return true;
};
