import { defineMessages } from "../../core/i18n/language";

export const specificationPageMessages = defineMessages({
  fr: {
    title: "Référentiel fonctionnel",
    subtitle:
      "L’état courant du produit : ce que chaque fonctionnalité fait aujourd’hui, et les règles qui la définissent.",
    counts: (domains: number, features: number, rules: number) =>
      `${domains} domaines · ${features} fonctionnalités · ${rules} règles actives`,
    anomalies: "Anomalies au chargement",
    moving: "Ce qui bouge",
    recentlyDelivered: "Livré récemment",
    whatChanged: "Ce qui a changé",
    noneDelivered: "Aucun cadrage n’a encore été livré.",
    inProgress: "En cours",
    readingBranches: "Lecture des branches en cours…",
    noneInProgress:
      "Aucun cadrage n’est en discussion. Ceux qui le seront apparaîtront ici, marqués de leur demande de fusion, à part de ce que le référentiel porte déjà.",
    openScoping: "Ouvrir un cadrage",
    also: (domains: string) => `· aussi ${domains}`,
    ruleCount: (n: number) => `${n} règles`,
    noDomain: "Ce dépôt ne contient aucun domaine.",
  },
  en: {
    title: "Functional specification",
    subtitle:
      "The current state of the product: what each feature does today, and the rules that define it.",
    counts: (domains: number, features: number, rules: number) =>
      `${domains} domain${domains === 1 ? "" : "s"} · ${features} feature${features === 1 ? "" : "s"} · ${rules} active rule${rules === 1 ? "" : "s"}`,
    anomalies: "Loading anomalies",
    moving: "What is moving",
    recentlyDelivered: "Recently delivered",
    whatChanged: "What has changed",
    noneDelivered: "No scoping has been delivered yet.",
    inProgress: "In progress",
    readingBranches: "Reading branches…",
    noneInProgress:
      "No scoping is under discussion. Those that are will appear here, marked with their pull request, apart from what the specification already holds.",
    openScoping: "Open a scoping",
    also: (domains: string) => `· also ${domains}`,
    ruleCount: (n: number) => `${n} rule${n === 1 ? "" : "s"}`,
    noDomain: "This repository contains no domain.",
  },
});
