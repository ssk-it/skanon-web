import type { Localized } from "./core/i18n/language";

type Heading = keyof typeof fr;

const fr = {
  openProject: "Ouvrir un projet",
  help: "Fonctionnement",
  legalNotice: "Mentions légales",
  specification: "Référentiel",
  domain: "Domaine",
  feature: "Fonctionnalité",
  rule: "Règle de gestion",
  architecture: "Architecture",
  architectureDocument: "Document d’architecture",
  architectureDecision: "Décision d’architecture",
  scopings: "Cadrages",
  newScoping: "Nouveau cadrage",
  editScoping: "Reprendre un cadrage",
  scoping: "Cadrage",
  evolution: "Ce qui a changé",
  settings: "Réglages du projet",
};

const en: Record<Heading, string> = {
  openProject: "Open a project",
  help: "How Skanon works",
  legalNotice: "Legal notice",
  specification: "Specification",
  domain: "Domain",
  feature: "Feature",
  rule: "Business rule",
  architecture: "Architecture",
  architectureDocument: "Architecture document",
  architectureDecision: "Architecture decision",
  scopings: "Scopings",
  newScoping: "New scoping",
  editScoping: "Resume a scoping",
  scoping: "Scoping",
  evolution: "What changed",
  settings: "Project settings",
};

/** Each route's heading, in each language: what the page title starts with. */
export const routeHeadings = Object.fromEntries(
  (Object.keys(fr) as Heading[]).map((k) => [k, { fr: fr[k], en: en[k] }]),
) as Record<Heading, Localized<string>>;
