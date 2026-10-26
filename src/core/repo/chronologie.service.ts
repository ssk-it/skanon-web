import { inject } from "../injection";
import { GithubClient, RepoRef } from "../github/github-client";

/** Une entrée de la chronologie d'une règle. */
export interface TimelineEntry {
  /** Identifiant du cadrage responsable du changement. */
  readonly scoping: string;
  /** Données Git, absentes si aucun commit ne correspond au cadrage. */
  readonly commit: TimelineCommit | null;
}

export interface TimelineCommit {
  readonly oid: string;
  readonly date: string;
  readonly author: string | null;
  readonly login: string | null;
  readonly title: string;
  readonly pullRequest: number | null;
  /** Énoncé de la règle tel qu'il était à ce commit. */
  readonly content: string | null;
}

/**
 * Historique d'un chemin : dates, auteurs et pull requests.
 *
 * Mesuré à **un point** sur `ssk-canon`, quel que soit le nombre de commits —
 * contre autant d'appels REST que de commits. C'est le cas d'école qui justifie
 * la répartition REST / GraphQL.
 */
const HISTORY_QUERY = `
query($owner:String!,$repo:String!,$path:String!,$max:Int!){
  repository(owner:$owner,name:$repo){
    defaultBranchRef{target{... on Commit{
      history(path:$path,first:$max){
        nodes{
          oid
          committedDate
          messageHeadline
          author{name user{login}}
          associatedPullRequests(first:1){nodes{number}}
        }
      }
    }}}
  }
}`;

interface HistoryResponse {
  repository: {
    defaultBranchRef: {
      target: {
        history: {
          nodes: Array<{
            oid: string;
            committedDate: string;
            messageHeadline: string;
            author: {
              name: string | null;
              user: { login: string } | null;
            } | null;
            associatedPullRequests: { nodes: Array<{ number: number }> };
          }>;
        };
      } | null;
    } | null;
  } | null;
}

/** Au-delà, la chronologie devient illisible bien avant d'être incomplète. */
const MAX_COMMITS = 30;

/**
 * Chronologie d'une règle de gestion.
 *
 * Deux sources se superposent, et aucune ne suffit seule :
 *
 * - **les cadrages** portent l'histoire métier complète, y compris les décisions
 *   antérieures au dépôt lui-même ;
 * - **Git** porte la date réelle, l'auteur et la pull request, qu'aucun fichier
 *   ne doit stocker — l'histoire se dérive, elle ne se duplique pas.
 *
 * L'appariement se fait par l'identifiant de cadrage cherché dans le message de
 * commit. Un cadrage sans commit correspondant reste affiché sans ses données
 * Git : c'est le cas d'un référentiel rédigé après coup, et le masquer
 * reviendrait à prétendre que la décision n'a pas eu lieu.
 */
export class TimelineService {
  private readonly github = inject(GithubClient);

  /**
   * Commits ayant touché le fichier d'une règle, du plus récent au plus ancien.
   *
   * Le contenu de chaque version n'est pas chargé ici : il coûte un alias par
   * commit et n'a d'intérêt que déplié. Voir `loadEnonceAuCommit`.
   */
  async loadRuleHistory(
    repoRef: RepoRef,
    ruleId: string,
  ): Promise<TimelineCommit[]> {
    const response = await this.github.graphql<HistoryResponse>(HISTORY_QUERY, {
      owner: repoRef.owner,
      repo: repoRef.repo,
      path: `rules/${ruleId}.md`,
      max: MAX_COMMITS,
    });

    const nodes =
      response.repository?.defaultBranchRef?.target?.history?.nodes ?? [];
    return nodes.map((n) => ({
      oid: n.oid,
      date: n.committedDate,
      author: n.author?.name ?? null,
      login: n.author?.user?.login ?? null,
      title: n.messageHeadline,
      pullRequest: n.associatedPullRequests.nodes[0]?.number ?? null,
      content: null,
    }));
  }

  /**
   * Énoncé d'une règle tel qu'il était à un commit donné.
   *
   * Chargé à la demande, au dépliement d'une entrée : charger les trente
   * versions d'avance ferait payer à chaque visite un coût dont le lecteur
   * n'utilise qu'une fraction.
   */
  async loadStatementAtCommit(
    repoRef: RepoRef,
    ruleId: string,
    oid: string,
  ): Promise<string | null> {
    const response = await this.github.graphql<{
      repository: { object: { text: string } | null } | null;
    }>(
      `query($owner:String!,$repo:String!,$expr:String!){
        repository(owner:$owner,name:$repo){object(expression:$expr){... on Blob{text}}}
      }`,
      {
        owner: repoRef.owner,
        repo: repoRef.repo,
        expr: `${oid}:rules/${ruleId}.md`,
      },
    );
    return response.repository?.object?.text ?? null;
  }

  /** Voir `apparierChronologie`. */
  match(
    scopings: readonly string[],
    commits: readonly TimelineCommit[],
  ): TimelineEntry[] {
    return matchTimeline(scopings, commits);
  }
}

/**
 * Apparie des cadrages à des commits.
 *
 * L'appariement se fait sur l'identifiant de cadrage présent dans le message de
 * commit. C'est volontairement souple : le message est rédigé par un humain, et
 * exiger un format précis ferait perdre l'appariement au premier message qui
 * s'en écarte, alors qu'une chronologie sans date reste utile.
 *
 * Fonction libre plutôt que méthode : elle ne dépend d'aucune injection, et
 * l'éprouver ne doit pas demander de construire un service.
 */
export function matchTimeline(
  scopings: readonly string[],
  commits: readonly TimelineCommit[],
): TimelineEntry[] {
  const remaining = [...commits];
  return scopings.map((scoping) => {
    const i = remaining.findIndex((c) => c.title.includes(scoping));
    // splice : un commit ne sert qu'une fois, sinon un message citant deux
    // cadrages daterait les deux entrées du même commit
    const commit = i >= 0 ? remaining.splice(i, 1)[0] : null;
    return { scoping: scoping, commit };
  });
}
