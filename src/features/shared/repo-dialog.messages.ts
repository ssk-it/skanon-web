import { defineMessages } from "../../core/i18n/language";

export const repoDialogMessages = defineMessages({
  fr: {
    title: "Ouvrir un dépôt de projet",
    framedRepos: "Dépôts cadrés",
    open: "ouvert",
    alreadyOpened: "déjà ouvert",
    removeFromList: "Retirer de la liste",
    otherRepos: (n: number) => `Autres dépôts autorisés (${n})`,
    othersHelp:
      "Ceux-ci ne portent pas encore de référentiel. En ouvrir un propose de l’amorcer.",
    searching: "Recherche des dépôts autorisés…",
    signedOut:
      "Sans connexion, seuls les dépôts publics sont lisibles, et l’application ne peut pas dire lesquels vous sont autorisés.",
    enterRepo: "Ou saisir un dépôt",
    placeholder: "organisation/depot",
    hint: "Un nom court, ou une URL GitHub complète",
    expectedFormat: "Format attendu : organisation/depot",
    cancel: "Annuler",
    confirm: "Ouvrir",
  },
  en: {
    title: "Open a project repo",
    framedRepos: "Scoping repos",
    open: "open",
    alreadyOpened: "opened before",
    removeFromList: "Remove from the list",
    otherRepos: (n) => `Other authorised repos (${n})`,
    othersHelp:
      "These do not hold a specification yet. Opening one offers to set it up.",
    searching: "Looking for authorised repos…",
    signedOut:
      "Without signing in, only public repos can be read, and the application cannot tell which ones you are authorised for.",
    enterRepo: "Or enter a repo",
    placeholder: "organisation/repo",
    hint: "A short name, or a full GitHub URL",
    expectedFormat: "Expected format: organisation/repo",
    cancel: "Cancel",
    confirm: "Open",
  },
});
