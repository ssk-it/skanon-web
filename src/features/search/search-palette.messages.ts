import { defineMessages } from "../../core/i18n/language";
import type { ResultKind } from "../../core/repo/search";

export const searchPaletteMessages = defineMessages({
  fr: {
    groups: {
      regle: "Règles de gestion",
      decision: "Décisions",
      architecture: "Architecture",
      cadrage: "Cadrages",
    } satisfies Record<ResultKind, string>,
    inProgress: "En cours",
    placeholder: "Rechercher une règle, une décision, un cadrage…",
    fieldLabel: "Rechercher dans le référentiel",
    escape: "Échap",
    pastState:
      "Les résultats valent pour le référentiel d’aujourd’hui, non pour les dates que vous consultez.",
    results: "Résultats",
    help: "Cherche dans le texte entier des règles, des décisions, de l’architecture et des cadrages — l’état actuel du référentiel, et les cadrages en cours.",
    loadingBranches:
      "Lecture des branches en cours… d’autres résultats peuvent s’ajouter.",
    onBranch: "Sur leur branche : pas encore dans le référentiel.",
    hidden: (n: number) =>
      `${n} autre${n > 1 ? "s" : ""} — précisez la recherche.`,
    noResult: (query: string) =>
      `Aucun résultat pour « ${query} ». La recherche porte sur les règles, les décisions, l’architecture et les cadrages, y compris les cadrages en cours.`,
    branchesStillLoading:
      "Les branches sont encore en lecture : un résultat peut encore apparaître.",
    browse: "parcourir",
    enter: "Entrée",
    open: "ouvrir",
  },
  en: {
    groups: {
      regle: "Business rules",
      decision: "Decisions",
      architecture: "Architecture",
      cadrage: "Scopings",
    },
    inProgress: "In progress",
    placeholder: "Search a rule, a decision, a scoping…",
    fieldLabel: "Search the specification",
    escape: "Esc",
    pastState:
      "Results hold for today’s specification, not for the dates you are viewing.",
    results: "Results",
    help: "Searches the full text of rules, decisions, architecture and scopings — the current state of the specification, and the scopings in progress.",
    loadingBranches: "Reading branches… more results may appear.",
    onBranch: "On their branch: not yet in the specification.",
    hidden: (n: number) => `${n} more — narrow the search.`,
    noResult: (query: string) =>
      `No results for “${query}”. The search covers rules, decisions, architecture and scopings, including scopings in progress.`,
    branchesStillLoading:
      "Branches are still being read: a result may yet appear.",
    browse: "browse",
    enter: "Enter",
    open: "open",
  },
});
