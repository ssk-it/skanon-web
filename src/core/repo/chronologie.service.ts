import { inject } from "../injection";
import { GithubClient, RefDepot } from "../github/github-client";

/** Une entrée de la chronologie d'une règle. */
export interface EntreeChronologie {
  /** Identifiant du cadrage responsable du changement. */
  readonly cadrage: string;
  /** Données Git, absentes si aucun commit ne correspond au cadrage. */
  readonly commit: CommitChronologie | null;
}

export interface CommitChronologie {
  readonly oid: string;
  readonly date: string;
  readonly auteur: string | null;
  readonly login: string | null;
  readonly titre: string;
  readonly pullRequest: number | null;
  /** Énoncé de la règle tel qu'il était à ce commit. */
  readonly contenu: string | null;
}

/**
 * Historique d'un chemin : dates, auteurs et pull requests.
 *
 * Mesuré à **un point** sur `ssk-canon`, quel que soit le nombre de commits —
 * contre autant d'appels REST que de commits. C'est le cas d'école qui justifie
 * la répartition REST / GraphQL.
 */
const REQUETE_HISTORIQUE = `
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

interface ReponseHistorique {
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
export class ChronologieService {
  private readonly github = inject(GithubClient);

  /**
   * Commits ayant touché le fichier d'une règle, du plus récent au plus ancien.
   *
   * Le contenu de chaque version n'est pas chargé ici : il coûte un alias par
   * commit et n'a d'intérêt que déplié. Voir `loadEnonceAuCommit`.
   */
  async loadHistoriqueRegle(
    depot: RefDepot,
    idRegle: string,
  ): Promise<CommitChronologie[]> {
    const reponse = await this.github.graphql<ReponseHistorique>(
      REQUETE_HISTORIQUE,
      {
        owner: depot.owner,
        repo: depot.repo,
        path: `rules/${idRegle}.md`,
        max: MAX_COMMITS,
      },
    );

    const noeuds =
      reponse.repository?.defaultBranchRef?.target?.history?.nodes ?? [];
    return noeuds.map((n) => ({
      oid: n.oid,
      date: n.committedDate,
      auteur: n.author?.name ?? null,
      login: n.author?.user?.login ?? null,
      titre: n.messageHeadline,
      pullRequest: n.associatedPullRequests.nodes[0]?.number ?? null,
      contenu: null,
    }));
  }

  /**
   * Énoncé d'une règle tel qu'il était à un commit donné.
   *
   * Chargé à la demande, au dépliement d'une entrée : charger les trente
   * versions d'avance ferait payer à chaque visite un coût dont le lecteur
   * n'utilise qu'une fraction.
   */
  async loadEnonceAuCommit(
    depot: RefDepot,
    idRegle: string,
    oid: string,
  ): Promise<string | null> {
    const reponse = await this.github.graphql<{
      repository: { object: { text: string } | null } | null;
    }>(
      `query($owner:String!,$repo:String!,$expr:String!){
        repository(owner:$owner,name:$repo){object(expression:$expr){... on Blob{text}}}
      }`,
      {
        owner: depot.owner,
        repo: depot.repo,
        expr: `${oid}:rules/${idRegle}.md`,
      },
    );
    return reponse.repository?.object?.text ?? null;
  }

  /** Voir `apparierChronologie`. */
  apparier(
    cadrages: readonly string[],
    commits: readonly CommitChronologie[],
  ): EntreeChronologie[] {
    return apparierChronologie(cadrages, commits);
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
export function apparierChronologie(
  cadrages: readonly string[],
  commits: readonly CommitChronologie[],
): EntreeChronologie[] {
  const restants = [...commits];
  return cadrages.map((cadrage) => {
    const i = restants.findIndex((c) => c.titre.includes(cadrage));
    // splice : un commit ne sert qu'une fois, sinon un message citant deux
    // cadrages daterait les deux entrées du même commit
    const commit = i >= 0 ? restants.splice(i, 1)[0] : null;
    return { cadrage, commit };
  });
}
