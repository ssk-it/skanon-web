import { defineMessages } from "../../core/i18n/language";

export const homeMessages = defineMessages({
  fr: {
    title: "Ouvrir un projet",
    subtitle:
      "Chaque projet a son dépôt, et chaque dépôt son référentiel. Choisissez celui sur lequel travailler.",
    openedBefore: "déjà ouvert",
    removeFromList: "Retirer de la liste",
    searchingRepos: "Recherche des dépôts autorisés…",
    otherRepos: (n: number) => `Autres dépôts autorisés (${n})`,
    otherReposHelp:
      "Ceux-ci ne portent pas encore de référentiel. En ouvrir un propose de l’amorcer.",
    repoField: "Ou saisir un dépôt",
    repoPlaceholder: "organisation/depot",
    repoHint: "Un nom court, ou une URL GitHub complète",
    invalidRepo: "Format attendu : organisation/depot",
    open: "Ouvrir",
    signInTitle: "Connexion à GitHub, facultative",
    signInHelp:
      "Les dépôts publics se lisent sans connexion. Un jeton personnel ouvre vos dépôts privés, dit lesquels vous sont autorisés, et porte la limite de GitHub de 60 à 5 000 requêtes par heure.",
    enterToken: "Saisir un jeton",
    pasteWhere: "par « Saisir un jeton », ci-dessus",
  },
  en: {
    title: "Open a project",
    subtitle:
      "Each project has its repo, and each repo its specification. Choose the one to work on.",
    openedBefore: "opened before",
    removeFromList: "Remove from the list",
    searchingRepos: "Looking for authorised repos…",
    otherRepos: (n: number) => `Other authorised repos (${n})`,
    otherReposHelp:
      "These do not hold a specification yet. Opening one offers to bootstrap it.",
    repoField: "Or enter a repo",
    repoPlaceholder: "owner/repo",
    repoHint: "A short name, or a full GitHub URL",
    invalidRepo: "Expected format: owner/repo",
    open: "Open",
    signInTitle: "Sign in to GitHub, optional",
    signInHelp:
      "Public repos are read without signing in. A personal token opens your private repos, tells which ones you are authorised on, and raises GitHub’s limit from 60 to 5,000 requests per hour.",
    enterToken: "Enter a token",
    pasteWhere: "through “Enter a token”, above",
  },
});
