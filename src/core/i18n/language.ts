/**
 * The languages the interface is displayed in (RG-langue-choisie). Two only: each must be kept as exact as the other (RG-aide-fidele), and a third nobody rereads would be wrong before being useful.
 */
export type Language = "fr" | "en";

export const LANGUAGES: readonly Language[] = ["fr", "en"];

/**
 * A value in every language — a phrase, a catalogue. Every language is required by the type: a missing phrase is a build error, never a silent fallback on the other language (RG-textes-traduits).
 */
export type Localized<T> = Readonly<Record<Language, T>>;

/**
 * A catalogue of messages, French first: the English one must have exactly its shape, so that a key missing or added on one side does not compile. Messages with parameters are functions.
 */
export function defineMessages<T>(messages: {
  readonly fr: T;
  readonly en: NoInfer<T>;
}): Localized<T> {
  return messages;
}

/** The locale dates and numbers are formatted in, for each language. */
export const FORMAT_LOCALE: Localized<string> = { fr: "fr-FR", en: "en-GB" };
