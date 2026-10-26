import { signal } from "../signals";
import { RepoRef } from "../github/github-client";

const KEY = "ssk-canon.depot";
const RECENTS_KEY = "ssk-canon.depots-recents";

/** Combien de dépôts on garde en mémoire. */
const MAX_RECENTS = 12;

/** Deux dépôts sont le même si l'organisation et le nom concordent, la casse
    n'étant pas significative sur la plateforme. */
export function sameRepo(a: RepoRef, b: RepoRef): boolean {
  return (
    a.owner.toLowerCase() === b.owner.toLowerCase() &&
    a.repo.toLowerCase() === b.repo.toLowerCase()
  );
}

/** Dépôt ouvert par défaut : celui de démonstration du produit. */
export const DEFAULT_REPO: RepoRef = {
  owner: "ssk-it",
  repo: "ssk-canon",
};

/**
 * Le dépôt de projet actuellement ouvert.
 *
 * Mémorisé dans le navigateur pour éviter de le ressaisir, et modifiable sans
 * reconstruction. En phase 7, le choix sera restreint aux dépôts sur lesquels
 * l'utilisateur a des droits.
 */
export class RepoConfig {
  readonly repoRef = signal<RepoRef>(this.readRepo());

  /**
   * Les dépôts déjà ouverts, le dernier en tête.
   *
   * Le référentiel d'un projet se consulte sur la durée, et l'on passe d'un
   * projet à l'autre : le retaper à chaque fois est une friction qui n'apprend
   * rien à personne.
   */
  readonly recents = signal<readonly RepoRef[]>(this.readRecents());

  saveRepo(repoRef: RepoRef): void {
    this.repoRef.set(repoRef);
    try {
      localStorage.setItem(KEY, JSON.stringify(repoRef));
    } catch {
      // navigation privée ou stockage bloqué : on garde la valeur en mémoire
    }
  }

  /**
   * Retient un dépôt effectivement ouvert.
   *
   * Appelé après un chargement réussi, et non au moment où on le demande : un
   * dépôt introuvable ou mal formé n'a rien à faire dans la liste des projets
   * sur lesquels on travaille.
   */
  rememberOpened(repoRef: RepoRef): void {
    this.remember(repoRef);
  }

  /** Retire un dépôt de la mémoire, sans toucher à celui qui est ouvert. */
  forget(repoRef: RepoRef): void {
    this.writeRecents(this.recents().filter((d) => !sameRepo(d, repoRef)));
  }

  /**
   * Place un dépôt en tête des récents.
   *
   * Le même dépôt n'y figure qu'une fois : rouvrir un projet le remonte plutôt
   * que de le dupliquer.
   */
  private remember(repoRef: RepoRef): void {
    const deduplicated = this.recents().filter((d) => !sameRepo(d, repoRef));
    this.writeRecents([repoRef, ...deduplicated].slice(0, MAX_RECENTS));
  }

  private writeRecents(list: readonly RepoRef[]): void {
    this.recents.set(list);
    try {
      localStorage.setItem(RECENTS_KEY, JSON.stringify(list));
    } catch {
      // idem
    }
  }

  private readRecents(): readonly RepoRef[] {
    try {
      const raw = localStorage.getItem(RECENTS_KEY);
      if (raw) {
        const list = JSON.parse(raw) as RepoRef[];
        if (Array.isArray(list)) {
          return list.filter((d) => d?.owner && d?.repo).slice(0, MAX_RECENTS);
        }
      }
    } catch {
      // idem
    }
    return [];
  }

  private readRepo(): RepoRef {
    try {
      const raw = localStorage.getItem(KEY);
      if (raw) {
        const d = JSON.parse(raw) as RepoRef;
        if (d?.owner && d?.repo) return d;
      }
    } catch {
      // idem
    }
    return DEFAULT_REPO;
  }

  /** Accepte « owner/repo » ou une URL GitHub complète. */
  static parseRepo(input: string): RepoRef | null {
    const cleaned = input
      .trim()
      .replace(/\.git$/, "")
      .replace(/\/+$/, "");
    if (!cleaned) return null;

    const url = /github\.com\/([^/]+)\/([^/]+)/.exec(cleaned);
    if (url) return { owner: url[1], repo: url[2] };

    const short = /^([\w.-]+)\/([\w.-]+)$/.exec(cleaned);
    if (short) return { owner: short[1], repo: short[2] };

    return null;
  }
}
