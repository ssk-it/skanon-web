import { defineMessages } from "../../core/i18n/language";

export const viewStateMessages = defineMessages({
  fr: {
    loading: "Chargement du référentiel…",
    files: (loaded: number, total: number) => `${loaded} / ${total} fichiers`,
    emptyRepo: "Ce dépôt est vide",
    emptyRepoDetail:
      "Il n’a encore rien reçu. L’application peut y déposer la structure d’un référentiel — les répertoires, la configuration, et de quoi s’y retrouver.",
    projectName: "Nom du projet",
    projectDescription: "En une phrase",
    installAutomation: "Installer l’automatisation",
    automationDetail:
      "Vérifie les cadrages avant leur livraison, et met à jour les règles une fois livrés. Demande un accès autorisé à écrire les workflows.",
    bootstrapping: "Dépôt en cours…",
    bootstrap: "Amorcer le référentiel",
    bootstrapNote:
      "Écrit directement sur la branche principale : il n’y a rien à relire dans un dépôt vide.",
    bootstrapFailed: "Le dépôt n’a pas pu être amorcé.",
    loadFailed: "Le dépôt n’a pas pu être chargé",
    retry: "Réessayer",
    noRepo: "Aucun dépôt ouvert",
  },
  en: {
    loading: "Loading the specification…",
    files: (loaded, total) => `${loaded} / ${total} files`,
    emptyRepo: "This repo is empty",
    emptyRepoDetail:
      "It has received nothing yet. The application can lay down the structure of a specification in it — the folders, the configuration, and what you need to find your way.",
    projectName: "Project name",
    projectDescription: "In one sentence",
    installAutomation: "Install the automation",
    automationDetail:
      "Checks scopings before they are delivered, and updates the rules once delivered. Requires access allowed to write workflows.",
    bootstrapping: "Setting up…",
    bootstrap: "Set up the specification",
    bootstrapNote:
      "Writes directly on the main branch: there is nothing to review in an empty repo.",
    bootstrapFailed: "The repo could not be set up.",
    loadFailed: "The repo could not be loaded",
    retry: "Try again",
    noRepo: "No repo open",
  },
});
