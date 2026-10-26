import type { Extension } from "../extension/extension";

/**
 * What the web version contributes to the shared interface: what belongs to its hosting, its service worker and its licence (ADR-extensions-commerciales, RG-mentions-legales). Another root serving the interface elsewhere would name its own host.
 */
export function webExtension(): Extension {
  return {
    id: "web",
    pages: {
      help: {
        cache: [
          "L’application elle-même est gardée par le navigateur, pour s’ouvrir hors ligne. Une nouvelle version attend que vous choisissiez de recharger.",
        ],
        communications: [
          "Le site d’où Skanon est servi — pour ses propres fichiers et ses nouvelles versions, jamais pour vos données.",
        ],
      },
      legalNotice: {
        host: "SCALEWAY SAS, BP 438, 75366 Paris Cedex 08, France.",
        ownership: [
          {
            before:
              "L’interface de Skanon et sa version web sont publiées en source disponible, sous la licence FSL-1.1-ALv2 : chacun peut les lire, les modifier et les employer, sauf pour en faire un produit concurrent ; chaque version passe sous Apache-2.0 deux ans après sa publication. Leurs sources : ",
            link: {
              label: "ssk-it/skanon-web",
              href: "https://github.com/ssk-it/skanon-web",
            },
            after: ".",
          },
        ],
      },
    },
  };
}
