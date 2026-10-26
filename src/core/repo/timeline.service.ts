import { inject } from "../injection";
import { GithubClient, RepoRef } from "../github/github-client";

/** An entry of a rule's timeline. */
export interface TimelineEntry {
  /** Identifier of the scoping responsible for the change. */
  readonly scoping: string;
  /** Git data, absent if no commit matches the scoping. */
  readonly commit: TimelineCommit | null;
}

export interface TimelineCommit {
  readonly oid: string;
  readonly date: string;
  readonly author: string | null;
  readonly login: string | null;
  readonly title: string;
  readonly pullRequest: number | null;
  /** The rule's statement as it was at this commit. */
  readonly content: string | null;
}

/**
 * History of a path: dates, authors and pull requests.
 *
 * Measured at **one point** on `ssk-canon`, whatever the number of commits —
 * against as many REST calls as commits. It is the textbook case that
 * justifies the REST / GraphQL split.
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

/** Beyond that, the timeline becomes unreadable well before being incomplete. */
const MAX_COMMITS = 30;

/**
 * Timeline of a business rule.
 *
 * Two sources overlap, and neither suffices alone:
 *
 * - **scopings** carry the complete business history, including decisions
 *   predating the repo itself;
 * - **Git** carries the actual date, the author and the pull request, which no
 *   file must store — history is derived, it is not duplicated.
 *
 * Matching is done by the scoping identifier looked for in the commit
 * message. A scoping without a matching commit stays displayed without its
 * Git data: that is the case of a specification written after the fact, and
 * hiding it would amount to claiming the decision did not happen.
 */
export class TimelineService {
  private readonly github = inject(GithubClient);

  /**
   * Commits that touched a rule's file, from most recent to oldest.
   *
   * The content of each version is not loaded here: it costs one alias per
   * commit and is only of interest when expanded. See `loadStatementAtCommit`.
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
   * A rule's statement as it was at a given commit.
   *
   * Loaded on demand, when an entry is expanded: loading the thirty versions
   * in advance would make every visit pay a cost of which the reader uses only
   * a fraction.
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

  /** See `matchTimeline`. */
  match(
    scopings: readonly string[],
    commits: readonly TimelineCommit[],
  ): TimelineEntry[] {
    return matchTimeline(scopings, commits);
  }
}

/**
 * Matches scopings to commits.
 *
 * Matching is done on the scoping identifier present in the commit message.
 * It is deliberately loose: the message is written by a human, and requiring
 * a precise format would lose the match at the first message that strays from
 * it, whereas a timeline without dates remains useful.
 *
 * A free function rather than a method: it depends on no injection, and
 * testing it must not require building a service.
 */
export function matchTimeline(
  scopings: readonly string[],
  commits: readonly TimelineCommit[],
): TimelineEntry[] {
  const remaining = [...commits];
  return scopings.map((scoping) => {
    const i = remaining.findIndex((c) => c.title.includes(scoping));
    // splice: a commit is used only once, otherwise a message citing two
    // scopings would date both entries from the same commit
    const commit = i >= 0 ? remaining.splice(i, 1)[0] : null;
    return { scoping: scoping, commit };
  });
}
