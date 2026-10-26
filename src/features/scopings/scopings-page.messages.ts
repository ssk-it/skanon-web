import { defineMessages } from "../../core/i18n/language";

const plural = (n: number, one: string, several: string) =>
  `${n} ${n > 1 ? several : one}`;
// English counts 0 as plural, French as singular.
const pluralEn = (n: number, one: string, several: string) =>
  `${n} ${n === 1 ? one : several}`;

export const scopingsPageMessages = defineMessages({
  fr: {
    title: "Cadrages",
    newScoping: "Nouveau cadrage",
    subtitle:
      "Les unités de changement. Chacune porte un objectif, les décisions qui l’ont façonnée, et ses impacts sur les règles de gestion.",
    filteredCount: (kept: number, total: number, inProgress: number) =>
      `${kept} ${kept > 1 ? "cadrages" : "cadrage"} sur ${total} · ${inProgress} en cours`,
    count: (total: number, inProgress: number) =>
      `${total} cadrages · ${inProgress} en cours`,
    filterLabel: "Filtrer les cadrages",
    filterField: "Filtrer par identifiant ou titre",
    domains: "Domaines",
    datesUnread: "Les dates de création n’ont pas pu être lues.",
    anonymousLimitBefore: "GitHub limite les requêtes anonymes :",
    signIn: "Se connecter",
    anonymousLimitAfter: "lève cette limite.",
    createdOn: (date: string) => `Créé le ${date}`,
    decisions: (n: number) => plural(n, "décision", "décisions"),
    impacts: (n: number) => plural(n, "impact", "impacts"),
    attachments: (n: number) => plural(n, "pièce jointe", "pièces jointes"),
    noImpact: "aucun impact déclaré",
    onBranch: (branch: string) => `Sur la branche ${branch}`,
    draft: " · brouillon",
    noMatch: "Aucun cadrage ne correspond à ce filtre.",
    clearFilter: "Effacer le filtre",
    empty: "Ce dépôt ne contient aucun cadrage.",
  },
  en: {
    title: "Scopings",
    newScoping: "New scoping",
    subtitle:
      "The units of change. Each carries a goal, the decisions that shaped it, and its impacts on the business rules.",
    filteredCount: (kept: number, total: number, inProgress: number) =>
      `${kept} ${kept === 1 ? "scoping" : "scopings"} of ${total} · ${inProgress} in progress`,
    count: (total: number, inProgress: number) =>
      `${total} scopings · ${inProgress} in progress`,
    filterLabel: "Filter scopings",
    filterField: "Filter by identifier or title",
    domains: "Domains",
    datesUnread: "Creation dates could not be read.",
    anonymousLimitBefore: "GitHub limits anonymous requests:",
    signIn: "Sign in",
    anonymousLimitAfter: "to lift this limit.",
    createdOn: (date: string) => `Created on ${date}`,
    decisions: (n: number) => pluralEn(n, "decision", "decisions"),
    impacts: (n: number) => pluralEn(n, "impact", "impacts"),
    attachments: (n: number) => pluralEn(n, "attachment", "attachments"),
    noImpact: "no impact declared",
    onBranch: (branch: string) => `On branch ${branch}`,
    draft: " · draft",
    noMatch: "No scoping matches this filter.",
    clearFilter: "Clear the filter",
    empty: "This repo contains no scoping.",
  },
});
