import { PLATFORM } from "../../plateforme/jeton";
import {
  INSTALLATION_FAILED,
  type NoVersionCause,
} from "../../plateforme/ports";
import { InjectionToken, inject, onDestroy } from "../injection";
import { signal } from "../signaux";

/**
 * Où en est la version que cette fenêtre exécute.
 *
 * `prete` : une version plus récente est téléchargée, et n'attend qu'un rechargement. `perdue` : le service worker ne peut plus servir la version en cours, et une vue chargée à la demande peut refuser de s'ouvrir.
 */
export type VersionState = "courante" | "prete" | "perdue";

/** Une heure : la fenêtre qui ne quitte jamais l'écran doit aussi l'apprendre. */
export const CHECK_INTERVAL = 60 * 60 * 1000;

/**
 * Le rechargement de la page, isolé pour que les tests puissent l'observer : celui de jsdom n'est ni remplaçable ni observable.
 */
export const RELOAD_PAGE = new InjectionToken<() => void>("RECHARGER_PAGE", {
  factory: () => () => document.location.reload(),
});

/** Les vues où le rédacteur tient une saisie que le rechargement effacerait. */
const INPUT_VIEWS = [
  /^cadrages\/nouveau$/,
  /^cadrages\/[^/]+\/editer$/,
  /^reglages$/,
];

/**
 * Vrai quand l'adresse désigne une page de saisie.
 *
 * Le bandeau s'en sert pour avertir, non pour décider : il ne sait pas si la saisie a changé, et n'a pas à le savoir pour prévenir qu'elle serait perdue.
 */
export function isInputUrl(url: string): boolean {
  // les deux premiers segments sont l'organisation et le dépôt, jamais une vue
  const view = (url.split(/[?#]/)[0] ?? "")
    .split("/")
    .filter(Boolean)
    .slice(2)
    .join("/");
  return INPUT_VIEWS.some((pattern) => pattern.test(view));
}

/**
 * La version de l'application — RG-nouvelle-version-proposee, RG-version-perdue-signalee.
 *
 * Le service worker télécharge une nouvelle version de lui-même, mais ne la cherche qu'au chargement d'une page, et ne la sert qu'au suivant. Une fenêtre de l'application installée, jamais rechargée, n'en saurait donc rien : ce service le lui demande, et dit ce qu'il a trouvé. Il le demande à l'annonceur de la plateforme (`plateforme/ports.ts`) : le service worker sur le web, le cœur natif sur le bureau, qui dit pourquoi il n'annonce rien.
 *
 * Il ne recharge ni ne relance jamais de lui-même. Un rechargement efface la saisie en cours et l'accès obtenu par une identité vérifiée : seul le rédacteur sait s'il peut se le permettre maintenant (2026-049, décision 01).
 */
export class VersionService {
  private readonly announcer = inject(PLATFORM).version;
  private readonly reloadPage = inject(RELOAD_PAGE);

  readonly state = signal<VersionState>("courante");

  /** Pourquoi aucune version n'est annoncée, telle que l'annonceur la nomme ; le livrable qui la connaît la formule. `null` quand la dernière vérification a abouti, et toujours sur le web. */
  readonly cause = signal<NoVersionCause | null>(null);

  /** Vrai quand passer à la version prête relance l'application : le bandeau dit « relancer » plutôt que « recharger ». */
  readonly relaunches = this.announcer.relaunches;

  constructor() {
    if (!this.announcer.active) return;

    const stopCause = this.announcer.listenCause((cause) =>
      this.cause.set(cause),
    );

    const stop = this.announcer.listen((announcement) => {
      if (announcement === "perdue") this.state.set("perdue");
      // une version perdue reste le message : c'est elle qu'il faut expliquer
      else if (this.state() === "courante") this.state.set("prete");
    });

    // Au premier plan pour la fenêtre retrouvée après une nuit, chaque heure pour celle qui ne quitte jamais l'écran (2026-049, décision 02).
    const inForeground = () => {
      if (document.visibilityState === "visible") void this.checkVersion();
    };
    document.addEventListener("visibilitychange", inForeground);
    const timer = setInterval(() => void this.checkVersion(), CHECK_INTERVAL);

    onDestroy(() => {
      stop();
      stopCause();
      document.removeEventListener("visibilitychange", inForeground);
      clearInterval(timer);
    });
  }

  /**
   * Demande s'il existe une version plus récente.
   *
   * La réponse arrive par l'annonce, non par le résultat. Un échec — hors ligne, le plus souvent — n'est pas une erreur à montrer : la vérification suivante reprendra.
   */
  async checkVersion(): Promise<void> {
    try {
      await this.announcer.check();
    } catch {
      // rien à dire : voir ci-dessus
    }
  }

  /**
   * Passe à la version publiée, sur la même adresse.
   *
   * Une version perdue n'a rien à activer : seule la version publiée peut encore être servie, et le rechargement y mène. Une activation qui échoue ne retient pas le rechargement : le bouton ne reste pas sans effet, et la vérification suivante retrouvera la version prête.
   *
   * Sur le bureau, l'activation installe la version et relance l'application : il n'y a rien à recharger. Une installation qui échoue se dit, et la version reste prête.
   */
  async reloadVersion(): Promise<void> {
    if (this.relaunches) {
      await this.relaunchVersion();
      return;
    }
    if (this.state() === "prete") {
      try {
        await this.announcer.activate();
      } catch {
        // voir ci-dessus
      }
    }
    this.reloadPage();
  }

  private async relaunchVersion(): Promise<void> {
    if (this.state() !== "prete") return;
    try {
      await this.announcer.activate();
    } catch {
      this.cause.set(INSTALLATION_FAILED);
    }
  }
}
