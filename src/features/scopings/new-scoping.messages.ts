import { defineMessages } from "../../core/i18n/language";

export const newScopingMessages = defineMessages({
  fr: {
    back: "Cadrages",
    type: "Nouveau cadrage",
    subtitle:
      "L’identifiant est attribué à la création et ne changera plus, même si le titre est réécrit.",
    tokenNeeded:
      "Écrire dans le dépôt demande une connexion, avec un jeton autorisant l’écriture. Le jeton de lecture seule conseillé pour la consultation ne suffit pas ici.",
    title: "Titre",
    titleHint: "Ce que ce cadrage change, en une ligne.",
    domains: "Domaines",
    domainsHint: (known: string) =>
      `Séparés par des virgules. Connus : ${known}`,
    goal: "Objectif",
    goalHint: "Le problème à résoudre, et pourquoi il mérite d’être traité.",
    journey: "Parcours utilisateur",
    journeyHint: "Ce que fait l’utilisateur, étape par étape.",
    aTitle: "un titre",
    aGoal: "un objectif",
    aJourney: "un parcours",
    missing: (what: string) => `Il manque encore : ${what}.`,
    cancel: "Annuler",
    creating: "Création…",
    create: "Créer le cadrage",
    failed: "La création du cadrage a échoué.",
    noteBefore: "La création ouvre une branche",
    noteAfter:
      "et une demande de fusion. Rien n’entre dans le référentiel avant sa livraison.",
  },
  en: {
    back: "Scopings",
    type: "New scoping",
    subtitle:
      "The identifier is assigned on creation and will not change, even if the title is rewritten.",
    tokenNeeded:
      "Writing to the repo requires signing in, with a token that allows writing. The read-only token recommended for browsing is not enough here.",
    title: "Title",
    titleHint: "What this scoping changes, in one line.",
    domains: "Domains",
    domainsHint: (known: string) => `Separated by commas. Known: ${known}`,
    goal: "Goal",
    goalHint: "The problem to solve, and why it is worth addressing.",
    journey: "User journey",
    journeyHint: "What the user does, step by step.",
    aTitle: "a title",
    aGoal: "a goal",
    aJourney: "a journey",
    missing: (what: string) => `Still missing: ${what}.`,
    cancel: "Cancel",
    creating: "Creating…",
    create: "Create the scoping",
    failed: "The scoping could not be created.",
    noteBefore: "Creating opens a branch",
    noteAfter:
      "and a pull request. Nothing enters the specification before it is delivered.",
  },
});
