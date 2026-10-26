import type { Localized } from "../../core/i18n/language";

/**
 * What the common interface says of a ready version that could not install (RG-nouvelle-version-proposee): the only cause without a version that it observes itself. The others are named and worded by the deliverable that knows them.
 */
export const INSTALLATION_FAILED_MESSAGE: Localized<string> = {
  fr: "La nouvelle version n’a pas pu s’installer.",
  en: "The new version could not be installed.",
};
