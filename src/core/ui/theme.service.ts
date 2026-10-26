import { computed, effect, signal } from "../signals";

/**
 * The theme the user wants.
 *
 * `systeme` is not an absence of choice but a choice in its own right: that
 * of following the device's setting, including when it switches during the
 * day. It is the default, and the only one of the three that can change without
 * anyone touching the application.
 */
export type Theme = "clair" | "sombre" | "systeme";

const THEMES: readonly Theme[] = ["clair", "sombre", "systeme"];
const KEY = "ssk-canon.theme";

/**
 * The display theme, and its memory.
 *
 * Following the system is done entirely in CSS — `color-scheme: light dark`
 * and a `prefers-color-scheme` query. This service only exists for the case
 * where one wants *not* to follow the system: forcing dark on a machine left
 * in light mode, for instance. It then sets an attribute the stylesheet
 * interprets, and does nothing else the rest of the time.
 */
export class ThemeService {
  /** The choice, as it was made. */
  readonly theme = signal<Theme>(this.readStored());

  /**
   * What the system asks for, observed continuously.
   *
   * Read on each change rather than once at startup: switching the
   * device's setting while the application is open is the ordinary
   * case, not the exception.
   */
  private readonly systemDark = signal(this.darkMedia?.matches ?? false);

  /** The theme actually applied, once `systeme` is resolved. */
  readonly effective = computed<"clair" | "sombre">(() => {
    const t = this.theme();
    if (t !== "systeme") return t;
    return this.systemDark() ? "sombre" : "clair";
  });

  private get darkMedia(): MediaQueryList | null {
    return typeof matchMedia === "function"
      ? matchMedia("(prefers-color-scheme: dark)")
      : null;
  }

  constructor() {
    this.darkMedia?.addEventListener("change", (e) =>
      this.systemDark.set(e.matches),
    );

    effect(() => {
      const t = this.theme();
      const root = document.documentElement;

      // No attribute when following the system: the stylesheet then switches
      // by itself. Setting one would require rewriting here what the CSS
      // already knows how to do, and keeping it in step with it.
      if (t === "systeme") root.removeAttribute("data-theme");
      else root.setAttribute("data-theme", t === "sombre" ? "sombre" : "clair");

      try {
        if (t === "systeme") localStorage.removeItem(KEY);
        else localStorage.setItem(KEY, t);
      } catch {
        // Private browsing, refused storage: the theme holds for the session.
        // Losing the memory of a display choice does not justify failing.
      }
    });
  }

  /** Moves to the next theme: light → dark → system. */
  toggle(): void {
    const i = THEMES.indexOf(this.theme());
    this.theme.set(THEMES[(i + 1) % THEMES.length]);
  }

  private readStored(): Theme {
    try {
      const raw = localStorage.getItem(KEY);
      return THEMES.includes(raw as Theme) ? (raw as Theme) : "systeme";
    } catch {
      return "systeme";
    }
  }
}
