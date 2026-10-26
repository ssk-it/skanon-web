import { defineMessages } from "../../core/i18n/language";

/** The headings that cut the scopings list. The group keys stay those of `groups.ts`: they serve the template's `track`, not the reader. */
export const groupsMessages = defineMessages({
  fr: {
    inProgress: "En cours",
    delivered: "Livrés",
    undated: "Pas encore daté",
    // « 1ᵉʳ » and not « 1ᵉ »: the first is the only one not following the rule.
    quarter: (quarter: string, year: string) =>
      `${quarter}${quarter === "1" ? "ᵉʳ" : "ᵉ"} trimestre ${year}`,
  },
  en: {
    inProgress: "In progress",
    delivered: "Delivered",
    undated: "Not dated yet",
    quarter: (quarter: string, year: string) => `Q${quarter} ${year}`,
  },
});
