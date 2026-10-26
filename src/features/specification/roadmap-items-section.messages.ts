import { defineMessages } from "../../core/i18n/language";
import type { Horizon } from "../../core/repo/roadmap-items.service";

/** The milestones named in `empty` are those the repo's issues carry: they are values of the repo, quoted as written, in every language. */
export const roadmapItemsSectionMessages = defineMessages({
  fr: {
    title: "À venir",
    warning:
      "Des pistes, non des règles : rien n’y est décidé tant qu’un cadrage ne les a pas instruites.",
    loading: "Lecture des pistes…",
    missingPermissionBefore:
      "Le jeton ne permet pas de lire les issues de ce dépôt, où vivent les pistes. Lui accorder la permission ",
    missingPermissionAfter: " en lecture.",
    thisDomain: "ce domaine",
    thisFeature: "cette fonctionnalité",
    emptyBefore: (subject: string) =>
      `Aucune piste pour ${subject}. Une piste est une issue de ce dépôt étiquetée `,
    emptyAnd: " et ",
    emptyAfter:
      ", rangée par son jalon : « maintenant », « ensuite » ou « plus tard ».",
    inProgress: "en cours",
    horizons: {
      maintenant: "Maintenant",
      ensuite: "Ensuite",
      "plus-tard": "Plus tard",
      "non-classee": "Non classées",
    } as Record<Horizon, string>,
  },
  en: {
    title: "Upcoming",
    warning:
      "Roadmap items, not rules: nothing is decided there until a scoping has examined them.",
    loading: "Reading roadmap items…",
    missingPermissionBefore:
      "The token cannot read this repository’s issues, where roadmap items live. Grant it the ",
    missingPermissionAfter: " read permission.",
    thisDomain: "this domain",
    thisFeature: "this feature",
    emptyBefore: (subject: string) =>
      `No roadmap item for ${subject}. A roadmap item is an issue of this repository labelled `,
    emptyAnd: " and ",
    emptyAfter:
      ", filed by its milestone: « maintenant », « ensuite » or « plus tard ».",
    inProgress: "in progress",
    horizons: {
      maintenant: "Now",
      ensuite: "Next",
      "plus-tard": "Later",
      "non-classee": "Unclassified",
    },
  },
});
