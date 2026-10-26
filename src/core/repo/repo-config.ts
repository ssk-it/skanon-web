import { signal } from "../signaux";
import { RefDepot } from "../github/github-client";

const CLE = "ssk-canon.depot";
const CLE_RECENTS = "ssk-canon.depots-recents";

/** Combien de dépôts on garde en mémoire. */
const MAX_RECENTS = 12;

/** Deux dépôts sont le même si l'organisation et le nom concordent, la casse
    n'étant pas significative sur la plateforme. */
export function memeDepot(a: RefDepot, b: RefDepot): boolean {
  return (
    a.owner.toLowerCase() === b.owner.toLowerCase() &&
    a.repo.toLowerCase() === b.repo.toLowerCase()
  );
}

/** Dépôt ouvert par défaut : celui de démonstration du produit. */
export const DEPOT_DEFAUT: RefDepot = {
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
  readonly depot = signal<RefDepot>(this.readDepot());

  /**
   * Les dépôts déjà ouverts, le dernier en tête.
   *
   * Le référentiel d'un projet se consulte sur la durée, et l'on passe d'un
   * projet à l'autre : le retaper à chaque fois est une friction qui n'apprend
   * rien à personne.
   */
  readonly recents = signal<readonly RefDepot[]>(this.readRecents());

  saveDepot(depot: RefDepot): void {
    this.depot.set(depot);
    try {
      localStorage.setItem(CLE, JSON.stringify(depot));
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
  memoriserOuvert(depot: RefDepot): void {
    this.memoriser(depot);
  }

  /** Retire un dépôt de la mémoire, sans toucher à celui qui est ouvert. */
  oublier(depot: RefDepot): void {
    this.ecrireRecents(this.recents().filter((d) => !memeDepot(d, depot)));
  }

  /**
   * Place un dépôt en tête des récents.
   *
   * Le même dépôt n'y figure qu'une fois : rouvrir un projet le remonte plutôt
   * que de le dupliquer.
   */
  private memoriser(depot: RefDepot): void {
    const sansDoublon = this.recents().filter((d) => !memeDepot(d, depot));
    this.ecrireRecents([depot, ...sansDoublon].slice(0, MAX_RECENTS));
  }

  private ecrireRecents(liste: readonly RefDepot[]): void {
    this.recents.set(liste);
    try {
      localStorage.setItem(CLE_RECENTS, JSON.stringify(liste));
    } catch {
      // idem
    }
  }

  private readRecents(): readonly RefDepot[] {
    try {
      const brut = localStorage.getItem(CLE_RECENTS);
      if (brut) {
        const liste = JSON.parse(brut) as RefDepot[];
        if (Array.isArray(liste)) {
          return liste.filter((d) => d?.owner && d?.repo).slice(0, MAX_RECENTS);
        }
      }
    } catch {
      // idem
    }
    return [];
  }

  private readDepot(): RefDepot {
    try {
      const brut = localStorage.getItem(CLE);
      if (brut) {
        const d = JSON.parse(brut) as RefDepot;
        if (d?.owner && d?.repo) return d;
      }
    } catch {
      // idem
    }
    return DEPOT_DEFAUT;
  }

  /** Accepte « owner/repo » ou une URL GitHub complète. */
  static parseDepot(saisie: string): RefDepot | null {
    const nettoye = saisie
      .trim()
      .replace(/\.git$/, "")
      .replace(/\/+$/, "");
    if (!nettoye) return null;

    const url = /github\.com\/([^/]+)\/([^/]+)/.exec(nettoye);
    if (url) return { owner: url[1], repo: url[2] };

    const court = /^([\w.-]+)\/([\w.-]+)$/.exec(nettoye);
    if (court) return { owner: court[1], repo: court[2] };

    return null;
  }
}
