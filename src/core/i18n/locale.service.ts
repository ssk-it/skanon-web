import { inject } from "../injection";
import { computed, effect, signal, type Signal } from "../signals";
import { FORMAT_LOCALE, type Language, type Localized } from "./language";

/**
 * The language the user wants. `browser` is a choice in its own right, the default: that of following the browser's language, including when it changes.
 */
export type LanguageChoice = "browser" | Language;

const CHOICES: readonly LanguageChoice[] = ["browser", "fr", "en"];
const KEY = "ssk-canon.language";

/**
 * The display language, and its memory (RG-langue-choisie), on the theme's model (RG-theme-choisi). A preference of the person, never a project setting: it is not written in `ssk-canon.yml` (RG-reglages-projet).
 */
export class LocaleService {
  /** The choice, as it was made. */
  readonly choice = signal<LanguageChoice>(this.readStored());

  private readonly browserLanguage = signal<Language>(readBrowserLanguage());

  /** The language actually displayed, once `browser` is resolved. */
  readonly language = computed<Language>(() => {
    const c = this.choice();
    return c === "browser" ? this.browserLanguage() : c;
  });

  /** The locale dates and numbers are formatted in. */
  readonly formatLocale = computed(() => FORMAT_LOCALE[this.language()]);

  constructor() {
    if (typeof window !== "undefined")
      window.addEventListener("languagechange", () =>
        this.browserLanguage.set(readBrowserLanguage()),
      );

    effect(() => {
      document.documentElement.lang = this.language();
    });

    effect(() => {
      const c = this.choice();
      try {
        if (c === "browser") localStorage.removeItem(KEY);
        else localStorage.setItem(KEY, c);
      } catch {
        // Private browsing, refused storage: the choice holds for the session. Losing the memory of a display choice does not justify failing.
      }
    });
  }

  /** A catalogue's messages in the displayed language, read again when it changes. */
  messages<T>(catalogue: Localized<T>): Signal<T> {
    return () => catalogue[this.language()];
  }

  private readStored(): LanguageChoice {
    try {
      const raw = localStorage.getItem(KEY);
      return CHOICES.includes(raw as LanguageChoice)
        ? (raw as LanguageChoice)
        : "browser";
    } catch {
      return "browser";
    }
  }
}

/** French for a French browser, English for any other: English is the most widely read language of those who do not read French. */
function readBrowserLanguage(): Language {
  const first =
    typeof navigator === "undefined"
      ? undefined
      : (navigator.languages?.[0] ?? navigator.language);
  return first?.toLowerCase().startsWith("fr") ? "fr" : "en";
}

/** A catalogue's messages in the displayed language: `t().title` in a template, typed to the key. */
export function useMessages<T>(catalogue: Localized<T>): Signal<T> {
  return inject(LocaleService).messages(catalogue);
}
