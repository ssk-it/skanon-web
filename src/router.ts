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
 * Toute vue d'un projet vit sous `/:owner/:repo/` : l'adresse porte le dépôt (RG-projet-dans-adresse). C'est ce qui rend un lien partageable — celui qui le reçoit voit le même projet, sans dépendre de ce que son poste avait mémorisé.
 */
export const routes: RouteRecordRaw[] = [
  page("/", "Ouvrir un projet", () => import("./features/home/HomePage.vue")),
  // L'adresse de réception des liens d'ouverture (RG-ouverture-par-protocole). Un seul segment : elle ne peut pas être prise pour un projet.
  deepLinkRoute,
  // Le fonctionnement de l'application, hors de tout projet comme l'accueil (RG-aide-a-portee). Un seul segment, comme ci-dessus.
  page("/aide", "Fonctionnement", () => import("./features/help/HelpPage.vue")),
  // L'éditeur, hors de tout projet comme l'aide, et atteint depuis la barre du bas.
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
  // Une adresse hors de tout projet ne peut pas deviner lequel : elle ramène au choix, plutôt que d'ouvrir un dépôt que personne n'a demandé.
  { path: "/:autre(.*)*", redirect: "/" },
];

export function createAppRouter(
  history: RouterHistory = createWebHistory(),
): Router {
  return createRouter({
    history,
    routes,
    // Un résultat de recherche peut viser une décision à l'intérieur de son cadrage : l'ancre doit y mener.
    scrollBehavior: (to) => (to.hash ? { el: to.hash } : { top: 0 }),
  });
}
