import {
  createRouter,
  createWebHistory,
  type RouteComponent,
  type RouteRecordRaw,
  type Router,
  type RouterHistory,
} from "vue-router";
import { repoGuard } from "./core/repo/depot.guard";
import { deepLinkRoute } from "./core/repo/lien-canon";
import { APPLICATION } from "./core/repo/titre.strategy";

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
  page(
    "/",
    "Ouvrir un projet",
    () => import("./features/accueil/AccueilPage.vue"),
  ),
  // L'adresse de réception des liens d'ouverture (RG-ouverture-par-protocole). Un seul segment : elle ne peut pas être prise pour un projet.
  deepLinkRoute,
  // Le fonctionnement de l'application, hors de tout projet comme l'accueil (RG-aide-a-portee). Un seul segment, comme ci-dessus.
  page("/aide", "Fonctionnement", () => import("./features/aide/AidePage.vue")),
  // L'éditeur, hors de tout projet comme l'aide, et atteint depuis la barre du bas.
  page(
    "/mentions-legales",
    "Mentions légales",
    () => import("./features/mentions-legales/MentionsLegalesPage.vue"),
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
        () => import("./features/referentiel/ReferentielPage.vue"),
      ),
      page(
        "referentiel/domaine/:id",
        "Domaine",
        () => import("./features/referentiel/DomainePage.vue"),
      ),
      page(
        "referentiel/fonctionnalite/:id",
        "Fonctionnalité",
        () => import("./features/referentiel/FonctionnalitePage.vue"),
      ),
      page(
        "referentiel/regle/:id",
        "Règle de gestion",
        () => import("./features/referentiel/ReglePage.vue"),
      ),
      page(
        "architecture",
        "Architecture",
        () => import("./features/referentiel/ArchitecturePage.vue"),
      ),
      page(
        "architecture/document/:id",
        "Document d’architecture",
        () => import("./features/referentiel/DocumentArchitecturePage.vue"),
      ),
      page(
        "architecture/decision/:id",
        "Décision d’architecture",
        () => import("./features/referentiel/DecisionArchitecturePage.vue"),
      ),
      page(
        "cadrages",
        "Cadrages",
        () => import("./features/cadrages/CadragesPage.vue"),
      ),
      page(
        "cadrages/nouveau",
        "Nouveau cadrage",
        () => import("./features/cadrages/NouveauCadragePage.vue"),
      ),
      page(
        "cadrages/:id/editer",
        "Reprendre un cadrage",
        () => import("./features/cadrages/EditerCadragePage.vue"),
      ),
      page(
        "cadrages/:id",
        "Cadrage",
        () => import("./features/cadrages/CadragePage.vue"),
      ),
      page(
        "evolution",
        "Ce qui a changé",
        () => import("./features/historique/EvolutionPage.vue"),
      ),
      page(
        "reglages",
        "Réglages du projet",
        () => import("./features/reglages/ReglagesPage.vue"),
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
