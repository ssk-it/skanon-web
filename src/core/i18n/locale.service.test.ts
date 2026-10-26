import { afterEach, describe, expect, it, vi } from "vitest";
import { inject } from "../injection";
import { defineMessages } from "./language";
import { LocaleService, useMessages } from "./locale.service";

/**
 * RG-langue-choisie: the application follows the browser's language, and lets itself be contradicted. Three states, like the theme: the browser's, French, English.
 */
describe("display language", () => {
  afterEach(() => vi.unstubAllGlobals());

  function browserIn(...languages: string[]): void {
    vi.stubGlobal("navigator", { ...navigator, languages });
  }

  it("follows a French browser by default", () => {
    browserIn("fr-CA", "en");
    const locale = inject(LocaleService);
    expect(locale.choice()).toBe("browser");
    expect(locale.language()).toBe("fr");
  });

  it("is English for any browser that is not French", () => {
    browserIn("de-DE", "fr");
    expect(inject(LocaleService).language()).toBe("en");
  });

  it("lets an explicit choice win over the browser, both ways", () => {
    browserIn("fr-FR");
    const locale = inject(LocaleService);
    locale.choice.set("en");
    expect(locale.language()).toBe("en");
    browserIn("en-US");
    locale.choice.set("fr");
    expect(locale.language()).toBe("fr");
  });

  it("switches by itself when the browser's language changes, while it follows it", () => {
    browserIn("en-US");
    const locale = inject(LocaleService);
    browserIn("fr-FR");
    window.dispatchEvent(new Event("languagechange"));
    expect(locale.language()).toBe("fr");
  });

  it("remembers the choice from one visit to the next", () => {
    browserIn("fr-FR");
    inject(LocaleService).choice.set("en");
    expect(localStorage.getItem("ssk-canon.language")).toBe("en");
    expect(new LocaleService().choice()).toBe("en");
  });

  it("forgets nothing to remember when the browser is followed again", () => {
    const locale = inject(LocaleService);
    locale.choice.set("en");
    locale.choice.set("browser");
    expect(localStorage.getItem("ssk-canon.language")).toBeNull();
  });

  it("holds for the session when storage is refused, without failing", () => {
    browserIn("fr-FR");
    const refusing = {
      getItem: () => {
        throw new Error("refused");
      },
      setItem: () => {
        throw new Error("refused");
      },
      removeItem: () => {
        throw new Error("refused");
      },
    };
    vi.stubGlobal("localStorage", refusing);
    const locale = new LocaleService();
    expect(locale.language()).toBe("fr");
    locale.choice.set("en");
    expect(locale.language()).toBe("en");
  });

  it("ignores a stored value it does not know", () => {
    browserIn("fr-FR");
    localStorage.setItem("ssk-canon.language", "de");
    expect(new LocaleService().choice()).toBe("browser");
  });

  it("gives the document its language, for screen readers and hyphenation", () => {
    browserIn("fr-FR");
    const locale = inject(LocaleService);
    expect(document.documentElement.lang).toBe("fr");
    locale.choice.set("en");
    expect(document.documentElement.lang).toBe("en");
  });

  it("serves a catalogue's messages in the displayed language", () => {
    browserIn("fr-FR");
    const messages = defineMessages({
      fr: { hello: "Bonjour", count: (n: number) => `${n} règles` },
      en: { hello: "Hello", count: (n: number) => `${n} rules` },
    });
    const t = useMessages(messages);
    expect(t().hello).toBe("Bonjour");
    inject(LocaleService).choice.set("en");
    expect(t().hello).toBe("Hello");
    expect(t().count(3)).toBe("3 rules");
  });
});
