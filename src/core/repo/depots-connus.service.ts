import { inject } from "../injection";
import { signal } from "../signaux";
import { GithubClient, RefDepot } from "../github/github-client";
import { RepoConfig, memeDepot } from "./repo-config";

/** Un dépôt proposé au choix, avec ce qu'on sait de lui. */
export interface DepotConnu {
  readonly depot: RefDepot;
  /** Porte un référentiel — vérifié, non supposé. */
  readonly cadre: boolean;
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
export class DepotsConnusService {
  private readonly github = inject(GithubClient);
  private readonly config = inject(RepoConfig);

  readonly depots = signal<readonly DepotConnu[]>([]);
  readonly enCours = signal(false);
  readonly erreur = signal<string | null>(null);

  /**
   * Rassemble les dépôts connus, et regarde lesquels portent un référentiel.
   *
   * Les récents sont proposés immédiatement, avant même que la découverte
   * n'aboutisse : ils sont déjà connus, et les faire attendre un appel réseau
   * les rendrait moins accessibles qu'avant.
   */
  async rafraichir(): Promise<void> {
    if (this.enCours()) return;
    this.enCours.set(true);
    this.erreur.set(null);

    const recents = this.config.recents();
    this.depots.set(
      recents.map((depot) => ({ depot, cadre: false, recent: true })),
    );

    try {
      const autorises = await this.github.listDepotsTousJetons();
      const tous = [
        // La graphie de la plateforme l'emporte sur celle d'une saisie : deux
        // casses pour une organisation la couperaient en deux à l'écran.
        ...recents.map((r) => autorises.find((a) => memeDepot(r, a)) ?? r),
        ...autorises.filter((a) => !recents.some((r) => memeDepot(r, a))),
      ];

      // Le contrôle passe par la file d'attente du client, qui borne la
      // concurrence : c'est elle qui protège des limites secondaires.
      const cadres = await Promise.all(
        tous.map((d) => this.github.estDepotCadre(d)),
      );

      this.depots.set(
        tous
          .map((depot, i) => ({
            depot,
            cadre: cadres[i],
            recent: recents.some((r) => memeDepot(r, depot)),
          }))
          // Les cadrés d'abord : ce sont les seuls que l'application sait
          // ouvrir. Les autres restent proposés, un dépôt vide qu'on veut
          // amorcer n'ayant pas encore de référentiel.
          .sort((a, b) => Number(b.cadre) - Number(a.cadre)),
      );
    } catch (e) {
      // La découverte qui échoue ne doit pas emporter les récents : ils sont
      // ce qui reste utile quand l'accès manque.
      this.erreur.set(
        e instanceof Error
          ? e.message
          : "Les dépôts autorisés n’ont pas pu être listés.",
      );
    } finally {
      this.enCours.set(false);
    }
  }
}

/** Les dépôts d'une même organisation, présentés ensemble. */
export interface GroupeOrganisation {
  readonly organisation: string;
  readonly depots: readonly DepotConnu[];
}

/**
 * Range les dépôts par organisation, pour qu'une longue liste se parcoure.
 *
 * Les organisations par nom ; dans chacune, les référentiels d'abord — ce sont
 * les seuls que l'application sait ouvrir, voir RG-projets-connus —, puis par
 * nom. La casse ne sépare rien, la plateforme ne la distinguant pas.
 */
export function groupDepotsByOrganisation(
  depots: readonly DepotConnu[],
): GroupeOrganisation[] {
  const parCle = new Map<string, DepotConnu[]>();
  for (const d of depots) {
    const cle = d.depot.owner.toLowerCase();
    const groupe = parCle.get(cle);
    if (groupe) groupe.push(d);
    else parCle.set(cle, [d]);
  }

  const parNom = (a: string, b: string) =>
    a.localeCompare(b, "fr", { sensitivity: "base" });
  return [...parCle.values()]
    .map((groupe) => ({
      organisation: groupe[0].depot.owner,
      depots: [...groupe].sort(
        (a, b) =>
          Number(b.cadre) - Number(a.cadre) ||
          parNom(a.depot.repo, b.depot.repo),
      ),
    }))
    .sort((a, b) => parNom(a.organisation, b.organisation));
}
