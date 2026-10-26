import type { Localized } from "../i18n/language";
import { LocaleService } from "../i18n/locale.service";
import { inject } from "../injection";
import { effect, signal } from "../signals";
import type { RouteLocationNormalized, Router } from "vue-router";
import { SpecificationStore } from "./specification.store";
import { displayIdentifier } from "./scoping-reference";

/** What follows every title: the application, so that it is recognised. */
export const APPLICATION = "Skanon";

/**
 * Composes the page title from the route and the loaded specification.
 *
 * The titles declared in routes are the same for all projects and all items:
 * « Règle de gestion — SSK Canon » says neither which repo one is working on,
 * nor which rule one is looking at. The browser history, which keeps only the
 * title, then becomes unusable — a dozen identical entries for as many
 * different pages.
 *
 * The title thus carries three things, from the most precise to the most
 * general: the item consulted, the project, the application. This is the
 * order that survives the truncation of a tab or a history entry: what
 * distinguishes comes first, what is common to all comes after.
 */
export class TitleStrategy {
  private readonly store = inject(SpecificationStore);
  private readonly locale = inject(LocaleService);

  /** The last known route state, to recompose without navigation. */
  private readonly currentState = signal<RouteLocationNormalized | null>(null);

  constructor() {
    // The specification loads after navigation: without this follow-up, the
    // title would stay on its fallback — « ssk-it/projet » instead of the name,
    // and the identifier alone instead of the scoping's title. It is the last
    // state the history keeps, hence the one that must be right. A language
    // switch recomposes it too.
    effect(() => {
      this.store.specification();
      this.locale.language();
      const state = this.currentState();
      if (state) document.title = this.compose(state);
    });
  }

  /** Follows the router's navigations: the title is recomposed on each one. */
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
   * The project, named if it is.
   *
   * The readable name comes from the specification and exists only once it is
   * loaded; `owner/repo` comes from the address and is there from navigation.
   * The fallback ensures no title stays silent during loading, and the title
   * gets more precise when the name arrives — it is this last state that the
   * history keeps.
   */
  private project(state: RouteLocationNormalized): string | null {
    const name = this.store.specification().project.name;
    // « Projet » is the default name of a repo that declares none: it
    // distinguishes nothing, and the repo is better.
    if (name && name !== "Projet") return name;

    // The repo is read from the address and not from the configuration: the
    // address carries it from navigation, whereas the configuration is only
    // updated by the route guard — the title would then display the previous
    // repo while the guard runs.
    return repoFromAddress(state);
  }

  /**
   * What is consulted: the designated item, or the route's label.
   *
   * An item whose specification is not loaded yet is given by its identifier
   * alone — that is already what distinguishes it, and waiting would leave a
   * generic title in the history if the user leaves the page before.
   */
  private element(state: RouteLocationNormalized): string | null {
    const id =
      typeof state.params["id"] === "string" ? state.params["id"] : null;
    const path = fullPath(state);

    if (!id) {
      const heading = leaf(state)?.meta["heading"] as
        Localized<string> | undefined;
      return heading?.[this.locale.language()] ?? null;
    }

    const prefix = this.store.specification().project.prefix;
    const shown = displayIdentifier(id, prefix);

    // A title does more than name: it must be found again in a history list.
    // The title of the scoping, the domain or the feature serves better there
    // than the identifier alone, when it exists.
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
    // Rules, decisions and architecture documents have no other name than
    // their identifier: it is enough.
    return null;
  }
}

/**
 * The repo the address carries, in the form « owner/repo ».
 *
 * Every view of a project lives under `/:owner/:repo/`: the first two
 * segments are enough, and they are known before any loading.
 */
function repoFromAddress(state: RouteLocationNormalized): string | null {
  const segments = state.path.split("/").filter(Boolean);
  return segments.length >= 2 ? `${segments[0]}/${segments[1]}` : null;
}

/** The displayed route, at the end of the activated branch. */
function leaf(state: RouteLocationNormalized) {
  return state.matched[state.matched.length - 1];
}

/** The route's full path, segments of all branches joined. */
function fullPath(state: RouteLocationNormalized): string {
  return state.path;
}
