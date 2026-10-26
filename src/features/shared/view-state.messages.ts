import { defineMessages } from "../../core/i18n/language";

export const viewStateMessages = defineMessages({
  fr: {
    loading: "Chargement du référentiel…",
    files: (loaded: number, total: number) => `${loaded} / ${total} fichiers`,
    emptyRepo: "Ce dépôt est vide",
    emptyRepoDetail:
      "Il n’a encore rien reçu. L’application peut y déposer la structure d’un référentiel — les répertoires, la configuration, et de quoi s’y retrouver.",
    loadFailed: "Le dépôt n’a pas pu être chargé",
    retry: "Réessayer",
    noRepo: "Aucun dépôt ouvert",
    waitingForUnlock: "Vos jetons sont verrouillés",
    waitingForUnlockDetail:
      "Ce dépôt est peut-être privé : déverrouillez vos jetons, dans le bandeau ci-dessus, et il s’ouvrira.",
  },
  en: {
    loading: "Loading the specification…",
    files: (loaded, total) => `${loaded} / ${total} files`,
    emptyRepo: "This repo is empty",
    emptyRepoDetail:
      "It has received nothing yet. The application can lay down the structure of a specification in it — the folders, the configuration, and what you need to find your way.",
    loadFailed: "The repo could not be loaded",
    retry: "Try again",
    noRepo: "No repo open",
    waitingForUnlock: "Your tokens are locked",
    waitingForUnlockDetail:
      "This repo may be private: unlock your tokens, in the banner above, and it will open.",
  },
});
