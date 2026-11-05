import { defineMessages } from "../../core/i18n/language";

export const appliedCitationsMessages = defineMessages({
  fr: {
    applies: "Applique",
    takenIntoAccount: "état pris en compte :",
    reading: "Lecture du référentiel cité…",
    current: "À jour",
    modifiedSince: "Modifiée depuis, par",
    repealed: "Abrogée dans le référentiel cité",
    by: ", par",
    missing: "Absente du référentiel cité",
    noAccess: (repo: string) =>
      `Non vérifiée : l’accès courant n’ouvre pas ${repo}.`,
    unreachable: (repo: string) => `Non vérifiée : ${repo} n’a pas répondu.`,
    unknownPrefix: (prefix: string) =>
      `Non vérifiée : le préfixe « ${prefix} » ne désigne aucun référentiel cité dans ssk-canon.yml.`,
  },
  en: {
    applies: "Applies",
    takenIntoAccount: "state taken into account:",
    reading: "Reading the cited specification…",
    current: "Up to date",
    modifiedSince: "Modified since, by",
    repealed: "Repealed in the cited specification",
    by: ", by",
    missing: "Missing from the cited specification",
    noAccess: (repo: string) =>
      `Unverified: the current access does not open ${repo}.`,
    unreachable: (repo: string) => `Unverified: ${repo} did not respond.`,
    unknownPrefix: (prefix: string) =>
      `Unverified: the prefix “${prefix}” designates no cited specification in ssk-canon.yml.`,
  },
});
