import type { Extension } from "../extension/extension";

const SOURCES = {
  label: "ssk-it/skanon-web",
  href: "https://github.com/ssk-it/skanon-web",
};

/**
 * What the web version contributes to the shared interface: what belongs to its hosting, its service worker and its licence (ADR-extensions-commerciales, RG-mentions-legales). Another root serving the interface elsewhere would name its own host.
 */
export function webExtension(): Extension {
  return {
    id: "web",
    pages: {
      help: {
        cache: [
          {
            fr: "L’application elle-même est gardée par le navigateur, pour s’ouvrir hors ligne. Une nouvelle version attend que vous choisissiez de recharger.",
            en: "The application itself is kept by the browser, to open offline. A new version waits until you choose to reload.",
          },
        ],
        communications: [
          {
            fr: "Le site d’où Skanon est servi — pour ses propres fichiers et ses nouvelles versions, jamais pour vos données.",
            en: "The site Skanon is served from — for its own files and its new versions, never for your data.",
          },
        ],
      },
      legalNotice: {
        // A registered address: the same in every language.
        host: {
          fr: "SCALEWAY SAS, BP 438, 75366 Paris Cedex 08, France.",
          en: "SCALEWAY SAS, BP 438, 75366 Paris Cedex 08, France.",
        },
        ownership: [
          {
            fr: {
              before:
                "L’interface de Skanon et sa version web sont publiées en source disponible, sous la licence FSL-1.1-ALv2 : chacun peut les lire, les modifier et les employer, sauf pour en faire un produit concurrent ; chaque version passe sous Apache-2.0 deux ans après sa publication. Leurs sources : ",
              link: SOURCES,
              after: ".",
            },
            en: {
              before:
                "Skanon’s interface and its web version are published as source-available, under the FSL-1.1-ALv2 licence: anyone may read, modify and use them, except to make a competing product of them; each version passes under Apache-2.0 two years after its publication. Their sources: ",
              link: SOURCES,
              after: ".",
            },
          },
        ],
      },
    },
  };
}
