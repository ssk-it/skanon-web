import { defineMessages } from "../../core/i18n/language";

export const featurePageMessages = defineMessages({
  fr: {
    back: "Référentiel",
    kind: "Fonctionnalité",
    rules: "Règles de gestion",
    repealed: "abrogée",
    noRule: "Aucune règle rattachée à cette fonctionnalité.",
    notFound: (id: string) => `Fonctionnalité introuvable : ${id}`,
  },
  en: {
    back: "Specification",
    kind: "Feature",
    rules: "Business rules",
    repealed: "repealed",
    noRule: "No rule attached to this feature.",
    notFound: (id: string) => `Feature not found: ${id}`,
  },
});
