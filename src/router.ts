import {
  createRouter,
  createWebHistory,
  type RouteComponent,
  type RouteRecordRaw,
  type Router,
  type RouterHistory,
} from "vue-router";
import { repoGuard } from "./core/repo/repo.guard";
import { deepLinkRoute } from "./core/repo/deep-link";
import type { Localized } from "./core/i18n/language";
import { routeHeadings } from "./router.messages";

/** The heading the title strategy shows for a route, in each language (RG-langue-choisie); the path is the format's and is never translated. */
function page(
  path: string,
  heading: Localized<string>,
  component:
    | RouteComponent
    | (() => Promise<RouteComponent | { default: RouteComponent }>),
): RouteRecordRaw {
  return { path, component, meta: { heading } };
}

const h = routeHeadings;

/**
 * Every view of a project lives under `/:owner/:repo/`: the address carries the repo (RG-projet-dans-adresse). This is what makes a link shareable — whoever receives it sees the same project, without depending on what their machine had remembered.
 */
export const routes: RouteRecordRaw[] = [
  page("/", h.openProject, () => import("./features/home/HomePage.vue")),
  // The address receiving deep links (RG-ouverture-par-protocole). A single segment: it cannot be mistaken for a project.
  deepLinkRoute,
  // How the application works, outside any project like the home page (RG-aide-a-portee). A single segment, as above.
  page("/aide", h.help, () => import("./features/help/HelpPage.vue")),
  // The publisher, outside any project like help, and reached from the bottom bar.
  page(
    "/mentions-legales",
    h.legalNotice,
    () => import("./features/legal-notice/LegalNoticePage.vue"),
  ),
  {
    path: "/:owner/:repo",
    beforeEnter: repoGuard,
    children: [
      {
        path: "",
        redirect: (to) =>
          `/${String(to.params["owner"])}/${String(to.params["repo"])}/referentiel`,
      },
      page(
        "referentiel",
        h.specification,
        () => import("./features/specification/SpecificationPage.vue"),
      ),
      page(
        "referentiel/domaine/:id",
        h.domain,
        () => import("./features/specification/DomainPage.vue"),
      ),
      page(
        "referentiel/fonctionnalite/:id",
        h.feature,
        () => import("./features/specification/FeaturePage.vue"),
      ),
      page(
        "referentiel/regle/:id",
        h.rule,
        () => import("./features/specification/RulePage.vue"),
      ),
      page(
        "architecture",
        h.architecture,
        () => import("./features/specification/ArchitecturePage.vue"),
      ),
      page(
        "architecture/document/:id",
        h.architectureDocument,
        () => import("./features/specification/ArchitectureDocumentPage.vue"),
      ),
      page(
        "architecture/decision/:id",
        h.architectureDecision,
        () => import("./features/specification/ArchitectureDecisionPage.vue"),
      ),
      page(
        "cadrages",
        h.scopings,
        () => import("./features/scopings/ScopingsPage.vue"),
      ),
      page(
        "cadrages/nouveau",
        h.newScoping,
        () => import("./features/scopings/NewScopingPage.vue"),
      ),
      page(
        "cadrages/:id/editer",
        h.editScoping,
        () => import("./features/scopings/EditScopingPage.vue"),
      ),
      page(
        "cadrages/:id",
        h.scoping,
        () => import("./features/scopings/ScopingPage.vue"),
      ),
      page(
        "evolution",
        h.evolution,
        () => import("./features/history/EvolutionPage.vue"),
      ),
      page(
        "reglages",
        h.settings,
        () => import("./features/settings/SettingsPage.vue"),
      ),
      {
        path: ":autre(.*)*",
        redirect: (to) =>
          `/${String(to.params["owner"])}/${String(to.params["repo"])}/referentiel`,
      },
    ],
  },
  // An address outside any project cannot guess which one: it leads back to the picker, rather than opening a repo nobody asked for.
  { path: "/:autre(.*)*", redirect: "/" },
];

export function createAppRouter(
  history: RouterHistory = createWebHistory(),
): Router {
  return createRouter({
    history,
    routes,
    // A search result may target a decision inside its scoping: the anchor must lead there.
    scrollBehavior: (to) => (to.hash ? { el: to.hash } : { top: 0 }),
  });
}
