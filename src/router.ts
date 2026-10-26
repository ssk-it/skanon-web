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
import { APPLICATION } from "./core/repo/title.strategy";

function page(
  path: string,
  heading: string,
  component:
    | RouteComponent
    | (() => Promise<RouteComponent | { default: RouteComponent }>),
): RouteRecordRaw {
  return { path, component, meta: { title: `${heading} — ${APPLICATION}` } };
}

/**
 * Every view of a project lives under `/:owner/:repo/`: the address carries the repo (RG-projet-dans-adresse). This is what makes a link shareable — whoever receives it sees the same project, without depending on what their machine had remembered.
 */
export const routes: RouteRecordRaw[] = [
  page("/", "Ouvrir un projet", () => import("./features/home/HomePage.vue")),
  // The address receiving deep links (RG-ouverture-par-protocole). A single segment: it cannot be mistaken for a project.
  deepLinkRoute,
  // How the application works, outside any project like the home page (RG-aide-a-portee). A single segment, as above.
  page("/aide", "Fonctionnement", () => import("./features/help/HelpPage.vue")),
  // The publisher, outside any project like help, and reached from the bottom bar.
  page(
    "/mentions-legales",
    "Mentions légales",
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
        "Référentiel",
        () => import("./features/specification/SpecificationPage.vue"),
      ),
      page(
        "referentiel/domaine/:id",
        "Domaine",
        () => import("./features/specification/DomainPage.vue"),
      ),
      page(
        "referentiel/fonctionnalite/:id",
        "Fonctionnalité",
        () => import("./features/specification/FeaturePage.vue"),
      ),
      page(
        "referentiel/regle/:id",
        "Règle de gestion",
        () => import("./features/specification/RulePage.vue"),
      ),
      page(
        "architecture",
        "Architecture",
        () => import("./features/specification/ArchitecturePage.vue"),
      ),
      page(
        "architecture/document/:id",
        "Document d’architecture",
        () => import("./features/specification/ArchitectureDocumentPage.vue"),
      ),
      page(
        "architecture/decision/:id",
        "Décision d’architecture",
        () => import("./features/specification/ArchitectureDecisionPage.vue"),
      ),
      page(
        "cadrages",
        "Cadrages",
        () => import("./features/scopings/ScopingsPage.vue"),
      ),
      page(
        "cadrages/nouveau",
        "Nouveau cadrage",
        () => import("./features/scopings/NewScopingPage.vue"),
      ),
      page(
        "cadrages/:id/editer",
        "Reprendre un cadrage",
        () => import("./features/scopings/EditScopingPage.vue"),
      ),
      page(
        "cadrages/:id",
        "Cadrage",
        () => import("./features/scopings/ScopingPage.vue"),
      ),
      page(
        "evolution",
        "Ce qui a changé",
        () => import("./features/history/EvolutionPage.vue"),
      ),
      page(
        "reglages",
        "Réglages du projet",
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
