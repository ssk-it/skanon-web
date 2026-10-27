import { inject } from "../injection";
import { defineMessages } from "../i18n/language";
import { LocaleService } from "../i18n/locale.service";

/**
 * What the reading and writing of a repo report to the user: the anomalies Skanon itself finds, and why an action is refused. What is written into the repo — commit messages, pull requests, section headings, `ssk-canon.yml` comments — never comes from here (RG-textes-traduits), nor do the messages of the shared checker.
 *
 * The format's keys and values (`depots_code`, `protection_du_jeton`…) are quoted as the file writes them, in both languages.
 */
export const repoMessages = defineMessages({
  fr: {
    // Reading the repo
    treeTruncated:
      "L’arborescence du dépôt a été tronquée par GitHub : le référentiel est incomplet.",
    frontmatterMissing: (path: string) => `${path} : frontmatter absent.`,
    unreadableFile: (path: string, error: string) => `${path} : ${error}.`,
    statusDeclared: (path: string) =>
      `${path} : le statut ne se déclare pas, il se déduit de l’état du dépôt.`,
    configUnreadable: (config: string, cause: string) =>
      `${config} : illisible — ${cause}.`,
    codeReposNotList: (config: string) =>
      `${config} : « depots_code » doit être une liste.`,
    codeRepoIgnored: (config: string, repo: string) =>
      `${config} : dépôt de code « ${repo || "(vide)"} » ignoré — ` +
      "attendu « organisation/depot ».",
    unknownTokenProtection: (config: string, value: string, expected: string) =>
      `${config} : protection du jeton inconnue « ${value} » — ` +
      `attendu ${expected}. La passkey est proposée, non exigée.`,

    // Loading and listing
    repoNotAnswering:
      "Le dépôt ne répond pas : l’état affiché est le dernier lu, et rien ne " +
      "peut s’y enregistrer avant qu’il ait été relu.",
    loadFailed: "Le chargement du dépôt a échoué.",
    knownReposFailed: "Les dépôts autorisés n’ont pas pu être listés.",
    roadmapItemsFailed: "Les pistes n'ont pas pu être lues.",
    noRecordAt: (date: string) =>
      `Le dépôt n’a aucun enregistrement au ${date} : ` +
      "cette date précède sa création.",

    // Authoring
    scopingDelivered:
      "Ce cadrage est livré : il ne se modifie plus. Ce qu’on veut y " +
      "changer passe par un nouveau cadrage.",
    scopingWithoutBranch:
      "Ce cadrage n’est porté par aucune branche du dépôt : il a peut-être " +
      "été abandonné, ou sa branche supprimée.",
    statusNotRequestable: (label: string) =>
      `« ${label} » ne se demande pas depuis l’application : ` +
      "ce statut vient de la relecture sur la plateforme.",
    statusFrozen:
      "Ce cadrage n’est pas porté par une branche : son statut ne bouge plus.",
    noOpenPullRequest:
      "Aucune demande de fusion ouverte sur ce cadrage : c’est elle qui porte son statut.",
    scopingWithoutFrontmatter: "Ce cadrage n’a pas de frontmatter.",
  },
  en: {
    treeTruncated:
      "The repo’s tree was truncated by GitHub: the specification is incomplete.",
    frontmatterMissing: (path: string) => `${path}: no frontmatter.`,
    unreadableFile: (path: string, error: string) => `${path}: ${error}.`,
    statusDeclared: (path: string) =>
      `${path}: the status is not declared, it is derived from the repo’s state.`,
    configUnreadable: (config: string, cause: string) =>
      `${config}: unreadable — ${cause}.`,
    codeReposNotList: (config: string) =>
      `${config}: “depots_code” must be a list.`,
    codeRepoIgnored: (config: string, repo: string) =>
      `${config}: code repo “${repo || "(empty)"}” ignored — ` +
      "expected “organisation/repo”.",
    unknownTokenProtection: (config: string, value: string, expected: string) =>
      `${config}: unknown token protection “${value}” — ` +
      `expected ${expected}. The passkey is offered, not required.`,

    repoNotAnswering:
      "The repo is not answering: the state shown is the last one read, and " +
      "nothing can be saved to it before it has been read again.",
    loadFailed: "Loading the repo failed.",
    knownReposFailed: "The authorised repos could not be listed.",
    roadmapItemsFailed: "The roadmap items could not be read.",
    noRecordAt: (date: string) =>
      `The repo has no record on ${date}: ` +
      "this date precedes its creation.",

    scopingDelivered:
      "This scoping is delivered: it can no longer be changed. Whatever is to " +
      "change in it goes through a new scoping.",
    scopingWithoutBranch:
      "No branch of the repo carries this scoping: it may have " +
      "been abandoned, or its branch deleted.",
    statusNotRequestable: (label: string) =>
      `“${label}” cannot be requested from the application: ` +
      "this status comes from the review on the platform.",
    statusFrozen: "No branch carries this scoping: its status no longer moves.",
    noOpenPullRequest:
      "No open pull request on this scoping: it is what carries its status.",
    scopingWithoutFrontmatter: "This scoping has no frontmatter.",
  },
});

/** The messages in the language displayed now: an anomaly or an error carries the language it was raised in. */
export function repoText(): (typeof repoMessages)["fr"] {
  return inject(LocaleService).messages(repoMessages)();
}
