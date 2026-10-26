import { inject } from "../injection";
import { signal } from "../signaux";
import { GithubClient, RepoRef } from "../github/github-client";
import { RepoConfig, sameRepo } from "./repo-config";

/** Un dépôt proposé au choix, avec ce qu'on sait de lui. */
export interface KnownRepo {
  readonly repoRef: RepoRef;
  /** Porte un référentiel — vérifié, non supposé. */
  readonly framed: boolean;
  /** Déjà ouvert par le passé. */
  readonly recent: boolean;
}

/**
 * Les dépôts proposés au choix : ceux déjà ouverts, et ceux que l'accès permet.
 *
 * Deux origines qui ne se remplacent pas. La mémoire garde les projets sur
 * lesquels on travaille, y compris sans connexion ; la découverte dit ce que
 * l'accès courant autorise réellement, ce qu'aucune mémoire ne peut savoir.
 */
export class KnownReposService {
  private readonly github = inject(GithubClient);
  private readonly config = inject(RepoConfig);

  readonly repos = signal<readonly KnownRepo[]>([]);
  readonly inProgress = signal(false);
  readonly error = signal<string | null>(null);

  /**
   * Rassemble les dépôts connus, et regarde lesquels portent un référentiel.
   *
   * Les récents sont proposés immédiatement, avant même que la découverte
   * n'aboutisse : ils sont déjà connus, et les faire attendre un appel réseau
   * les rendrait moins accessibles qu'avant.
   */
  async refresh(): Promise<void> {
    if (this.inProgress()) return;
    this.inProgress.set(true);
    this.error.set(null);

    const recents = this.config.recents();
    this.repos.set(
      recents.map((repoRef) => ({
        repoRef: repoRef,
        framed: false,
        recent: true,
      })),
    );

    try {
      const allowed = await this.github.listReposAllTokens();
      const all = [
        // La graphie de la plateforme l'emporte sur celle d'une saisie : deux
        // casses pour une organisation la couperaient en deux à l'écran.
        ...recents.map((r) => allowed.find((a) => sameRepo(r, a)) ?? r),
        ...allowed.filter((a) => !recents.some((r) => sameRepo(r, a))),
      ];

      // Le contrôle passe par la file d'attente du client, qui borne la
      // concurrence : c'est elle qui protège des limites secondaires.
      const framedRepos = await Promise.all(
        all.map((d) => this.github.isScopingRepo(d)),
      );

      this.repos.set(
        all
          .map((repoRef, i) => ({
            repoRef: repoRef,
            framed: framedRepos[i],
            recent: recents.some((r) => sameRepo(r, repoRef)),
          }))
          // Les cadrés d'abord : ce sont les seuls que l'application sait
          // ouvrir. Les autres restent proposés, un dépôt vide qu'on veut
          // amorcer n'ayant pas encore de référentiel.
          .sort((a, b) => Number(b.framed) - Number(a.framed)),
      );
    } catch (e) {
      // La découverte qui échoue ne doit pas emporter les récents : ils sont
      // ce qui reste utile quand l'accès manque.
      this.error.set(
        e instanceof Error
          ? e.message
          : "Les dépôts autorisés n’ont pas pu être listés.",
      );
    } finally {
      this.inProgress.set(false);
    }
  }
}

/** Les dépôts d'une même organisation, présentés ensemble. */
export interface OrganizationGroup {
  readonly organization: string;
  readonly repos: readonly KnownRepo[];
}

/**
 * Range les dépôts par organisation, pour qu'une longue liste se parcoure.
 *
 * Les organisations par nom ; dans chacune, les référentiels d'abord — ce sont
 * les seuls que l'application sait ouvrir, voir RG-projets-connus —, puis par
 * nom. La casse ne sépare rien, la plateforme ne la distinguant pas.
 */
export function groupReposByOrganization(
  repos: readonly KnownRepo[],
): OrganizationGroup[] {
  const byKey = new Map<string, KnownRepo[]>();
  for (const d of repos) {
    const key = d.repoRef.owner.toLowerCase();
    const group = byKey.get(key);
    if (group) group.push(d);
    else byKey.set(key, [d]);
  }

  const byName = (a: string, b: string) =>
    a.localeCompare(b, "fr", { sensitivity: "base" });
  return [...byKey.values()]
    .map((group) => ({
      organization: group[0].repoRef.owner,
      repos: [...group].sort(
        (a, b) =>
          Number(b.framed) - Number(a.framed) ||
          byName(a.repoRef.repo, b.repoRef.repo),
      ),
    }))
    .sort((a, b) => byName(a.organization, b.organization));
}
