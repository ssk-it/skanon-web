import { computed, effect, signal } from "../signaux";

/**
 * Le thème voulu par l'utilisateur.
 *
 * `systeme` n'est pas une absence de choix mais un choix à part entière : celui
 * de suivre le réglage de l'appareil, y compris quand il bascule en cours de
 * journée. C'est le défaut, et le seul des trois qui puisse changer sans que
 * personne ne touche à l'application.
 */
export type Theme = "clair" | "sombre" | "systeme";

const THEMES: readonly Theme[] = ["clair", "sombre", "systeme"];
const CLE = "ssk-canon.theme";

/**
 * Le thème d'affichage, et sa mémoire.
 *
 * Le suivi du système se fait entièrement en CSS — `color-scheme: light dark`
 * et une requête `prefers-color-scheme`. Ce service n'existe que pour le cas
 * où l'on veut *ne pas* suivre le système : forcer le sombre sur un poste resté
 * en clair, par exemple. Il pose alors un attribut que la feuille de style
 * interprète, et ne fait rien d'autre le reste du temps.
 */
export class ThemeService {
  /** Le choix, tel qu'il a été fait. */
  readonly theme = signal<Theme>(this.lireMemoire());

  /**
   * Ce que le système demande, observé en continu.
   *
   * Lu à chaque changement plutôt qu'une fois au démarrage : basculer le
   * réglage de l'appareil pendant que l'application est ouverte est le cas
   * ordinaire, pas l'exception.
   */
  private readonly systemeSombre = signal(this.mediaSombre?.matches ?? false);

  /** Le thème réellement appliqué, une fois `systeme` résolu. */
  readonly effectif = computed<"clair" | "sombre">(() => {
    const t = this.theme();
    if (t !== "systeme") return t;
    return this.systemeSombre() ? "sombre" : "clair";
  });

  private get mediaSombre(): MediaQueryList | null {
    return typeof matchMedia === "function"
      ? matchMedia("(prefers-color-scheme: dark)")
      : null;
  }

  constructor() {
    this.mediaSombre?.addEventListener("change", (e) =>
      this.systemeSombre.set(e.matches),
    );

    effect(() => {
      const t = this.theme();
      const racine = document.documentElement;

      // Aucun attribut quand on suit le système : la feuille de style bascule
      // alors d'elle-même. En poser un obligerait à réécrire ici ce que le CSS
      // sait déjà faire, et à le tenir d'accord avec lui.
      if (t === "systeme") racine.removeAttribute("data-theme");
      else
        racine.setAttribute("data-theme", t === "sombre" ? "sombre" : "clair");

      try {
        if (t === "systeme") localStorage.removeItem(CLE);
        else localStorage.setItem(CLE, t);
      } catch {
        // Navigation privée, stockage refusé : le thème vaut pour la session.
        // Perdre la mémoire d'un choix d'affichage ne justifie pas d'échouer.
      }
    });
  }

  /** Passe au thème suivant : clair → sombre → système. */
  basculer(): void {
    const i = THEMES.indexOf(this.theme());
    this.theme.set(THEMES[(i + 1) % THEMES.length]);
  }

  private lireMemoire(): Theme {
    try {
      const brut = localStorage.getItem(CLE);
      return THEMES.includes(brut as Theme) ? (brut as Theme) : "systeme";
    } catch {
      return "systeme";
    }
  }
}
