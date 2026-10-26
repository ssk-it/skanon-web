import type { Extension } from "../extension/extension";

/**
 * Ce que la version web apporte à l'interface commune : ce qui tient à son hébergement, à son service worker et à sa licence (ADR-extensions-commerciales, RG-mentions-legales). Une autre racine qui servirait l'interface ailleurs nommerait son propre hébergeur.
 */
export function extensionWeb(): Extension {
  return {
    id: "web",
    pages: {
      aide: {
        cache: [
          "L’application elle-même est gardée par le navigateur, pour s’ouvrir hors ligne. Une nouvelle version attend que vous choisissiez de recharger.",
        ],
        communications: [
          "Le site d’où Skanon est servi — pour ses propres fichiers et ses nouvelles versions, jamais pour vos données.",
        ],
      },
      mentions: {
        hebergeur: "SCALEWAY SAS, BP 438, 75366 Paris Cedex 08, France.",
        propriete: [
          {
            avant:
              "L’interface de Skanon et sa version web sont publiées en source disponible, sous la licence FSL-1.1-ALv2 : chacun peut les lire, les modifier et les employer, sauf pour en faire un produit concurrent ; chaque version passe sous Apache-2.0 deux ans après sa publication. Leurs sources : ",
            lien: {
              libelle: "ssk-it/skanon-web",
              href: "https://github.com/ssk-it/skanon-web",
            },
            apres: ".",
          },
        ],
      },
    },
  };
}
