import { inject } from "../injection";
import { RepoConfig } from "./repo-config";

/**
 * Builds internal links, prefixed by the open repo.
 *
 * Every view of the application belongs to a framing repo, and the address
 * says so: `/organisation/depot/referentiel`. A hard-coded link would leave the
 * current project without flagging it; going through here guarantees there is
 * only one place where the prefix is built.
 */
export class LinksService {
  private readonly config = inject(RepoConfig);

  /**
   * A link to a view of the open repo.
   *
   * `to('cadrages', id)` gives `['/', owner, repo, 'cadrages', id]`.
   */
  to(...segments: readonly (string | number)[]): unknown[] {
    const d = this.config.repoRef();
    return ["/", d.owner, d.repo, ...segments];
  }

  /** The same link, as one address: what `RouterLink` takes. */
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
   * The address of the framing repo on GitHub.
   *
   * The application only shows of the repo what it can read; everything else —
   * issues, open pull requests, settings, full history —
   * is consulted on GitHub. The link leads there without making one retype the organization and
   * the repo, which are already in the current address.
   *
   * `toGithub('issues')` gives `https://github.com/owner/repo/issues`.
   */
  toGithub(...segments: readonly (string | number)[]): string {
    const d = this.config.repoRef();
    const path = [d.owner, d.repo, ...segments]
      .map((s) => encodeURIComponent(String(s)))
      .join("/");
    return `https://github.com/${path}`;
  }
}
