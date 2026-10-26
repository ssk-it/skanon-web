import { inject } from "../injection";
import { RepoConfig } from "./repo-config";

/**
 * Fabrique les liens internes, préfixés par le dépôt ouvert.
 *
 * Toute vue de l'application appartient à un dépôt de projet, et l'adresse le
 * dit : `/organisation/depot/referentiel`. Un lien écrit en dur sortirait du
 * projet courant sans le signaler ; passer par ici garantit qu'il n'existe
 * qu'un seul endroit où le préfixe est construit.
 */
export class LinksService {
  private readonly config = inject(RepoConfig);

  /**
   * Un lien vers une vue du dépôt ouvert.
   *
   * `vers('cadrages', id)` donne `['/', owner, repo, 'cadrages', id]`.
   */
  to(...segments: readonly (string | number)[]): unknown[] {
    const d = this.config.repoRef();
    return ["/", d.owner, d.repo, ...segments];
  }

  /** Le même lien, en une adresse : ce que prend `RouterLink`. */
  path(...segments: readonly (string | number)[]): string {
    const d = this.config.repoRef();
    return (
      "/" +
      [d.owner, d.repo, ...segments]
        .map((s) => encodeURIComponent(String(s)))
        .join("/")
    );
  }

  /**
   * L'adresse du dépôt de cadrage sur GitHub.
   *
   * L'application ne montre du dépôt que ce qu'elle sait lire ; tout le reste —
   * les issues, les pull requests en cours, les réglages, l'historique complet —
   * se consulte sur GitHub. Le lien y mène sans faire retaper l'organisation et
   * le dépôt, qui sont déjà dans l'adresse courante.
   *
   * `versGithub('issues')` donne `https://github.com/owner/repo/issues`.
   */
  toGithub(...segments: readonly (string | number)[]): string {
    const d = this.config.repoRef();
    const path = [d.owner, d.repo, ...segments]
      .map((s) => encodeURIComponent(String(s)))
      .join("/");
    return `https://github.com/${path}`;
  }
}
