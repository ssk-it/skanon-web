import { defineMessages } from "../../core/i18n/language";

export const domainPageMessages = defineMessages({
  fr: {
    back: "Référentiel",
    kind: "Domaine",
    features: "Fonctionnalités",
    featureShared: "Rattachée à plusieurs domaines",
    scopingShared: "Rattaché à plusieurs domaines",
    alsoIn: "aussi dans",
    ruleCount: (n: number) => `${n} règles`,
    noFeature: "Aucune fonctionnalité rattachée à ce domaine.",
    scopings: "Cadrages",
    noScoping: "Aucun cadrage rattaché à ce domaine.",
    notFound: (id: string) => `Domaine introuvable : ${id}`,
  },
  en: {
    back: "Specification",
    kind: "Domain",
    features: "Features",
    featureShared: "Attached to several domains",
    scopingShared: "Attached to several domains",
    alsoIn: "also in",
    ruleCount: (n: number) => `${n} rule${n === 1 ? "" : "s"}`,
    noFeature: "No feature attached to this domain.",
    scopings: "Scopings",
    noScoping: "No scoping attached to this domain.",
    notFound: (id: string) => `Domain not found: ${id}`,
  },
});
