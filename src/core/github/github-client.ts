import { HttpClient, HttpErrorResponse, HttpHeaders } from "../http/http";
import { inject } from "../injection";
import { signal } from "../signals";
import { RateLimiter } from "./rate-limiter";
import { TokenService } from "./token.service";
import { ReviewDecision } from "../model/model";
import { githubText } from "./github.messages";

/**
 * An open pull request, as the list of in-progress scopings reads it.
 *
 * `approval` is `null` when nobody has given a verdict, but also when the
 * read could not obtain it: the caller must therefore never conclude from it
 * that an approval was refused, only that it is not established.
 */
export interface OpenPullRequest {
  readonly number: number;
  readonly branch: string;
  readonly draft: boolean;
  readonly approval: ReviewDecision | null;
}

/** An entry of the Git tree. */
export interface TreeEntry {
  readonly path: string;
  readonly sha: string;
  readonly type: "blob" | "tree";
  readonly size?: number;
}

export interface Tree {
  /**
   * The resolved commit, not the tree object: queried on a branch or on
   * `HEAD`, `git/trees` answers with the SHA of the requested commit-ish. This
   * is what allows reading contents at a fixed commit without an extra call.
   */
  readonly sha: string;
  readonly entries: readonly TreeEntry[];
  /** True if the API truncated the response — never reached on Markdown. */
  readonly truncated: boolean;
  /** The response's tag, to request the tree again conditionally. */
  readonly etag: string | null;
}

/** An already read tree, to request again conditionally. */
export interface KnownTree {
  readonly etag: string | null;
  readonly commit: string;
  readonly entries: readonly TreeEntry[];
  readonly truncated: boolean;
}

/** A commit, as resolved from a date. */
export interface CommitDate {
  readonly sha: string;
  readonly date: string | null;
  readonly title: string;
}

/** Coordinates of a project repo. */
/** An issue as the REST API returns it, reduced to what the application reads from it. */
export interface RawIssue {
  readonly number: number;
  readonly title: string;
  readonly html_url: string;
  readonly labels: readonly (string | { readonly name?: string })[];
  readonly milestone: { readonly title: string } | null;
  readonly pull_request?: unknown;
}

export interface RepoRef {
  readonly owner: string;
  readonly repo: string;
  /** Branch, tag or SHA. Defaults to the repo's default branch. */
  readonly ref?: string;
}

/**
 * Error reported in the body of a GraphQL response.
 *
 * GraphQL answers `200` even on failure, the error living in an `errors`
 * array of the body. HTTP error handling would therefore never see it: without
 * this check, a refused query would pass for an empty response.
 */
export class GraphqlError extends Error {
  constructor(
    message: string,
    readonly type?: string,
  ) {
    super(message);
  }
}

export class GithubError extends Error {
  constructor(
    message: string,
    readonly status: number,
    readonly quotaExhausted = false,
  ) {
    super(message);
  }
}

/**
 * Access to the GitHub API.
 *
 * Single, isolated entry point: in phase 7, only `buildHeaders()` will change to
 * relay through the proxy with the installation token. The rest of the
 * application will know nothing of it.
 */
export class GithubClient {
  private readonly http = inject(HttpClient);
  private readonly tokens = inject(TokenService);
  /**
   * Two distinct queues, because the two routes do not have the same
   * constraints. The API is subject to secondary limits — a hundred concurrent
   * requests for the whole installation — hence a cautious value.
   * `raw.githubusercontent` has no quota: throttling it amounted to slowing the
   * load without protecting anything. Measured: going from 6 to 24 halves the
   * load time on a repo of sixty files.
   */
  private readonly apiLimiter = new RateLimiter(6);
  private readonly rawLimiter = new RateLimiter(24);
  private readonly base = "https://api.github.com";

  /** Remaining quota as reported by the last response. */
  readonly quotaRemaining = signal<number | null>(null);

  /**
   * Why writes are suspended, if they are.
   *
   * Set as long as the application shows a state the repo has not confirmed:
   * a write based on a version not known to be current would produce the
   * conflict, or the overwrite, that the prior read exists to avoid. See
   * RG-dernier-etat-connu. All writes going through `send`, that is where
   * they are refused.
   */
  readonly writeSuspended = signal<string | null>(null);

  /**
   * Load contents through the API rather than through raw.
   *
   * Two reasons to want it, one not to do it by default:
   *
   * - Private repos are not served by raw. Mandatory for them.
   * - But a load then costs one request per file instead of a single one.
   *   Without a token, the quota of sixty per hour goes in one go.
   *
   * Freshness is no longer one of them: contents are requested from `raw` at
   * the commit's SHA and not at the branch name, so the `max-age: 300`
   * applies to an immutable URL. See `RepoLoader.loadSpecification`.
   *
   * So it stays disabled by default, and only makes sense with a token.
   */
  readonly contentsViaApi = signal(false);

  useApiForContents(active: boolean): void {
    this.contentsViaApi.set(active);
  }

  private buildHeaders(repoRef?: RepoRef): HttpHeaders {
    // The token comes from the dedicated service, never from storage directly: in
    // phase 7, the proxy will provide an installation token and this method will
    // not change by a single line.
    let headers = new HttpHeaders({
      Accept: "application/vnd.github+json",
      "X-GitHub-Api-Version": "2022-11-28",
    });
    const token = repoRef ? this.tokens.valueFor(repoRef) : this.tokens.value();
    if (token) headers = headers.set("Authorization", `Bearer ${token}`);
    return headers;
  }

  /**
   * `repoRef` chooses the token from this repo rather than from the current
   * target — for a call about a project other than the open one.
   */
  private async call<T>(
    url: string,
    accept?: string,
    repoRef?: RepoRef,
  ): Promise<T> {
    return this.apiLimiter.run(async () => {
      let headers = this.buildHeaders(repoRef);
      if (accept) headers = headers.set("Accept", accept);

      try {
        const response = await this.http.get<T>(url, { headers });
        const remaining = response.headers.get("x-ratelimit-remaining");
        if (remaining !== null) this.quotaRemaining.set(Number(remaining));
        return response.body as T;
      } catch (e) {
        // GitHub returns the quota header on errors too, and that is precisely
        // where it matters: without this read, the application no longer knows
        // where it stands at the very moment it is blocked.
        if (e instanceof HttpErrorResponse) {
          const remaining = e.headers?.get("x-ratelimit-remaining");
          if (remaining !== null && remaining !== undefined) {
            this.quotaRemaining.set(Number(remaining));
          }
        }
        throw this.toGithubError(e);
      }
    });
  }

  /**
   * Translates a GraphQL error into a displayable message.
   *
   * GitHub's messages are in English and talk about schema resolution:
   * "Could not resolve to a Repository". As is, they describe the mechanics
   * rather than what the reader must do.
   *
   * `NOT_FOUND` deserves particular attention: GitHub answers the same thing
   * for a nonexistent repo and for a repo the token does not reach — not
   * telling a private one from an absent one is deliberate on its part, and the
   * message must therefore cover both cases without asserting either.
   */
  private toGraphqlError(error: {
    message: string;
    type?: string;
  }): GraphqlError {
    if (error.type === "NOT_FOUND") {
      return new GraphqlError(githubText().graphqlNotFound, error.type);
    }
    if (error.type === "RATE_LIMITED") {
      return new GraphqlError(githubText().graphqlRateLimited, error.type);
    }
    if (error.type === "FORBIDDEN") {
      return new GraphqlError(githubText().graphqlForbidden, error.type);
    }
    return new GraphqlError(error.message, error.type);
  }

  private toGithubError(e: unknown, writing = false): GithubError {
    if (!(e instanceof HttpErrorResponse)) {
      return new GithubError(githubText().unexpected, 0);
    }
    const t = githubText();
    const remaining = e.headers?.get("x-ratelimit-remaining");
    const quotaExhausted = e.status === 403 && remaining === "0";

    if (quotaExhausted) {
      return new GithubError(
        this.tokens.present() ? t.quotaWithToken : t.quotaWithoutToken,
        403,
        true,
      );
    }
    // A refused token must be stated as such: without this case, the user would read
    // a message about quota while their token is expired or revoked.
    if (e.status === 401) {
      // Without a token, talking about an expired token would send one looking for one
      // that does not exist. The cause is absence, not invalidity.
      return new GithubError(
        this.tokens.present() ? t.tokenRefused : t.signInRequired,
        401,
      );
    }
    // A 403 that is not an exhausted quota designates a missing permission. GitHub
    // answers so when a read-only token tries to write, which is the common
    // case: the sign-in advised for browsing is not enough for authoring, and
    // "GitHub answered 403" would not say so.
    if (e.status === 403) {
      return new GithubError(t.writePermissionMissing, 403);
    }
    if (e.status === 404) {
      // Without sign-in, the platform answers 404 to a write it would
      // refuse — it does not reveal what exists to whoever has no right to it.
      // Talking about a repo not found would send one looking for a name error
      // where a sign-in is simply missing.
      if (writing && !this.tokens.present()) {
        return new GithubError(t.writeSignInRequired, 404);
      }
      return new GithubError(
        this.tokens.present() ? t.notFoundWithToken : t.notFoundWithoutToken,
        404,
      );
    }
    // On a write, the 409 says the version read is no longer the latest:
    // someone saved in the meantime (RG-reprise-cadrage). Talking about an
    // empty repo would send one to drop a README where a reload is needed.
    if (e.status === 409 && writing) {
      return new GithubError(t.writeConflict, 409);
    }
    // A repo created but without any commit: its default branch is
    // announced without existing. The case comes up at a project's first use,
    // and « le dépôt n'a pas pu être chargé » would not help to get out of it.
    if (e.status === 409) {
      return new GithubError(t.emptyRepo, 409);
    }
    if (e.status === 0) {
      return new GithubError(t.unreachable, 0);
    }
    return new GithubError(t.status(e.status), e.status);
  }

  /**
   * Full tree in one call.
   *
   * GraphQL cannot be used here: `Tree.entries` is neither recursive nor
   * paginated. This is one of the cases where REST is mandatory.
   */
  async loadTree(repoRef: RepoRef, known?: KnownTree | null): Promise<Tree> {
    const ref = repoRef.ref ?? "HEAD";
    const url = `${this.base}/repos/${repoRef.owner}/${repoRef.repo}/git/trees/${ref}?recursive=1`;

    // Conditional only with a token: the platform then does not count an
    // "unchanged" response, but it does count it without sign-in —
    // measured. Anonymous, the condition would only add a case without
    // saving anything.
    const etag = known?.etag && this.tokens.present() ? known.etag : null;

    return this.apiLimiter.run(async () => {
      let headers = this.buildHeaders();
      if (etag) headers = headers.set("If-None-Match", etag);
      try {
        const response = await this.http.get<{
          sha: string;
          truncated: boolean;
          tree: Array<{
            path: string;
            sha: string;
            type: string;
            size?: number;
          }>;
        }>(url, { headers });
        this.recordQuota(response.headers.get("x-ratelimit-remaining"));
        const raw = response.body;
        return {
          sha: raw.sha,
          truncated: raw.truncated,
          etag: response.headers.get("etag"),
          entries: raw.tree
            .filter((e) => e.type === "blob" || e.type === "tree")
            .map((e) => ({
              path: e.path,
              sha: e.sha,
              type: e.type as "blob" | "tree",
              size: e.size,
            })),
        };
      } catch (e) {
        if (e instanceof HttpErrorResponse) {
          this.recordQuota(e.headers?.get("x-ratelimit-remaining") ?? null);
          // Unchanged: the known tree is the current tree, and the platform
          // has just confirmed it.
          if (e.status === 304 && known && etag) {
            return {
              sha: known.commit,
              truncated: known.truncated,
              etag: known.etag,
              entries: known.entries,
            };
          }
        }
        throw this.toGithubError(e);
      }
    });
  }

  private recordQuota(remaining: string | null): void {
    if (remaining !== null) this.quotaRemaining.set(Number(remaining));
  }

  /**
   * Content of a file.
   *
   * Two routes, and the choice has a direct consequence on the quota:
   *
   * - `raw.githubusercontent.com` is **not** counted against the API quota, serves
   *   CORS and honours conditional requests. It is the normal route for a
   *   public repo: loading fifty files then costs zero quota requests,
   *   against fifty through the API. Verified, not assumed.
   * - The `git/blobs` API works on private repos with a token, but
   *   consumes one request per file.
   *
   * The anonymous quota being sixty requests per hour and per IP address, the
   * first route is what makes reading a real repo practicable without
   * authentication. In phase 7, private repos will switch to the second.
   */
  async loadContent(
    repoRef: RepoRef,
    path: string,
    sha: string,
  ): Promise<string> {
    if (!this.contentsViaApi()) {
      // `repoRef.ref` preferably carries a commit SHA: the caller has already
      // resolved the branch, and a branch URL would be served from the cache
      // for five minutes after a write.
      const ref = repoRef.ref ?? "HEAD";
      const url = `https://raw.githubusercontent.com/${repoRef.owner}/${repoRef.repo}/${ref}/${path}`;
      try {
        return await this.rawLimiter.run(() =>
          this.http.get(url, { responseType: "text" }).then((r) => r.body),
        );
      } catch (e) {
        // The uncounted channel does not serve private repos: it answers 404
        // even for whoever has the right to it. Switch to the other rather than
        // announce a missing file — a private repo can be read, at the cost of one call per file.
        if (
          e instanceof HttpErrorResponse &&
          e.status === 404 &&
          this.tokens.present()
        ) {
          this.contentsViaApi.set(true);
          return this.loadBlob(repoRef, sha);
        }
        throw this.toGithubError(e);
      }
    }
    return this.loadBlob(repoRef, sha);
  }

  /**
   * Content of a blob by its SHA, through the API.
   *
   * Addressing by SHA rather than by path works whatever the commit and
   * makes caching trivial: a SHA identifies a content, forever.
   */
  async loadBlob(repoRef: RepoRef, sha: string): Promise<string> {
    const url = `${this.base}/repos/${repoRef.owner}/${repoRef.repo}/git/blobs/${sha}`;

    return this.apiLimiter.run(async () => {
      // A file's content is not JSON: without `responseType`, Angular
      // tries to parse it as such and fails on a response that is nonetheless valid.
      // The raw media type also avoids base64 decoding and its inflation.
      const headers = this.buildHeaders().set(
        "Accept",
        "application/vnd.github.raw",
      );
      try {
        const response = await this.http.get(url, {
          headers,
          responseType: "text",
        });
        const remaining = response.headers.get("x-ratelimit-remaining");
        if (remaining !== null) this.quotaRemaining.set(Number(remaining));
        return response.body ?? "";
      } catch (e) {
        throw this.toGithubError(e);
      }
    });
  }

  // --- project identity ---
  //
  // Each call is made under the named repo's access, not under that of the open
  // project: the home page reads the identity of projects from other organisations.

  /**
   * The entries at the root of a repo, requested again conditionally.
   *
   * Returns `null` when the root has not changed since `etag`: under an
   * access, the platform does not count this response. The contents endpoint,
   * and not `git/trees`: the latter returns the resolved commit, which changes
   * with every write and its tag with it, whereas the root listing only
   * changes if one of its directories changes.
   */
  async loadRoot(
    repoRef: RepoRef,
    etag: string | null,
  ): Promise<{ etag: string | null; entries: TreeEntry[] } | null> {
    const url = `${this.base}/repos/${repoRef.owner}/${repoRef.repo}/contents/`;
    return this.apiLimiter.run(async () => {
      let headers = this.buildHeaders(repoRef);
      if (etag) headers = headers.set("If-None-Match", etag);
      try {
        const response = await this.http.get<
          Array<{ path: string; sha: string; type: string; size?: number }>
        >(url, {
          headers,
        });
        this.recordQuota(response.headers.get("x-ratelimit-remaining"));
        return {
          etag: response.headers.get("etag"),
          // An empty repo, or an unexpected response: nothing at the root.
          entries: (Array.isArray(response.body) ? response.body : [])
            .filter((e) => e.type === "file" || e.type === "dir")
            .map((e) => ({
              path: e.path,
              sha: e.sha,
              type: e.type === "dir" ? ("tree" as const) : ("blob" as const),
              size: e.size,
            })),
        };
      } catch (e) {
        if (e instanceof HttpErrorResponse) {
          this.recordQuota(e.headers?.get("x-ratelimit-remaining") ?? null);
          if (e.status === 304 && etag) return null;
        }
        throw this.toGithubError(e);
      }
    });
  }

  /**
   * The files of a directory designated by its fingerprint.
   *
   * A fingerprint designates a content forever: what was read under it
   * never needs requesting again.
   */
  async loadTreeBySha(repoRef: RepoRef, sha: string): Promise<TreeEntry[]> {
    const raw = await this.call<{
      tree: Array<{ path: string; sha: string; type: string; size?: number }>;
    }>(
      `${this.base}/repos/${repoRef.owner}/${repoRef.repo}/git/trees/${sha}`,
      undefined,
      repoRef,
    );
    return raw.tree
      .filter((e) => e.type === "blob")
      .map((e) => ({
        path: e.path,
        sha: e.sha,
        type: "blob" as const,
        size: e.size,
      }));
  }

  /** The bytes of a blob, through the API: an image is not text. */
  async loadBlobBytes(repoRef: RepoRef, sha: string): Promise<ArrayBuffer> {
    const url = `${this.base}/repos/${repoRef.owner}/${repoRef.repo}/git/blobs/${sha}`;
    return this.apiLimiter.run(async () => {
      const headers = this.buildHeaders(repoRef).set(
        "Accept",
        "application/vnd.github.raw",
      );
      try {
        const response = await this.http.get(url, {
          headers,
          responseType: "arraybuffer",
        });
        this.recordQuota(response.headers.get("x-ratelimit-remaining"));
        return response.body ?? new ArrayBuffer(0);
      } catch (e) {
        throw this.toGithubError(e);
      }
    });
  }

  /**
   * The bytes of a file through the uncounted channel, at the default
   * branch's name. `null` if it does not exist.
   *
   * `HEAD` designates the default branch without needing to know it:
   * resolving it would cost one counted call per listed project, out of sixty
   * per hour. This is the exception RG-lecture-identite accepts to reading at
   * the commit.
   *
   * The channel does not expose its tag to the script, and refuses the preflight
   * that a hand-set `If-None-Match` would trigger — measured. The condition
   * is therefore left to the browser: `no-cache` makes it revalidate its copy
   * with the tag it holds, and an unchanged response brings nothing back.
   */
  async loadRawBytes(
    repoRef: RepoRef,
    path: string,
  ): Promise<ArrayBuffer | null> {
    const url = `https://raw.githubusercontent.com/${repoRef.owner}/${repoRef.repo}/HEAD/${path}`;
    try {
      return await this.rawLimiter.run(() =>
        this.http
          .get(url, { responseType: "arraybuffer", cache: "no-cache" })
          .then((r) => r.body),
      );
    } catch (e) {
      if (e instanceof HttpErrorResponse && e.status === 404) return null;
      throw this.toGithubError(e);
    }
  }

  /**
   * Date of the first commit that touched a path — the object's creation.
   *
   * History is never stored in the files: it is derived from Git.
   * So the API answers, and the call is made on demand rather than at
   * load, so as not to charge every visit a cost proportional to the
   * number of scopings.
   *
   * Returns `null` rather than failing: a missing date degrades the
   * display, it must not prevent reading.
   */
  async creationDate(repoRef: RepoRef, path: string): Promise<string | null> {
    const url =
      `${this.base}/repos/${repoRef.owner}/${repoRef.repo}/commits` +
      `?path=${encodeURIComponent(path)}&per_page=100`;
    try {
      const commits =
        await this.call<
          Array<{ commit: { committer: { date: string } | null } }>
        >(url);
      // the API returns newest to oldest: the creation is at the end
      return commits.at(-1)?.commit?.committer?.date ?? null;
    } catch {
      return null;
    }
  }

  /**
   * GraphQL query.
   *
   * Measured on `ssk-canon`: a rule's complete history — dates, authors,
   * pull requests — costs **one point**, against as many REST calls as
   * commits. The two budgets are separate and cumulative, 5000 each per hour.
   *
   * GraphQL accepts no anonymous call, unlike REST: without a token, it
   * answers 403 whatever the repo, even a public one. The call is therefore refused
   * right here, with a message that says what to do — letting the request go
   * would only produce a more obscure error.
   */
  async graphql<T>(
    query: string,
    variables: Record<string, unknown>,
  ): Promise<T> {
    if (!this.tokens.present()) {
      throw new GithubError(githubText().historyRequiresSignIn, 403);
    }

    return this.apiLimiter.run(async () => {
      try {
        const response = await this.http.post<{
          data?: T;
          errors?: Array<{ message: string; type?: string }>;
        }>(
          `${this.base}/graphql`,
          { query, variables },
          { headers: this.buildHeaders() },
        );

        const body = response.body;
        const first = body?.errors?.[0];
        if (first) throw this.toGraphqlError(first);
        if (!body?.data) throw new GraphqlError(githubText().graphqlNoData);
        return body.data;
      } catch (e) {
        if (e instanceof GraphqlError) throw e;
        throw this.toGithubError(e);
      }
    });
  }

  /**
   * Last commit before or at a date.
   *
   * A single call: `until` asks GitHub to filter, and `per_page=1` to
   * return only the most recent of the matching commits. Rebuilding the specification
   * at that date then costs one call for the tree — contents being
   * served outside the quota, including when addressed by SHA.
   *
   * Returns `null` if the repo has no commit at that date, which happens
   * for a date before its creation.
   */
  async commitAtDate(repoRef: RepoRef, date: Date): Promise<CommitDate | null> {
    const url =
      `${this.base}/repos/${repoRef.owner}/${repoRef.repo}/commits` +
      `?until=${encodeURIComponent(date.toISOString())}&per_page=1`;
    const commits = await this.call<
      Array<{
        sha: string;
        commit: { committer: { date: string } | null; message: string };
      }>
    >(url);

    const first = commits[0];
    if (!first) return null;
    return {
      sha: first.sha,
      date: first.commit.committer?.date ?? null,
      title: first.commit.message.split("\n")[0],
    };
  }

  /**
   * Date of the repo's oldest commit.
   *
   * Serves as the lower bound for any dated browsing: before it, there is nothing to
   * rebuild. The repo's creation date would not do — it can
   * stay empty for a while, and the gap was measured at more than two hours on the
   * reference repo.
   *
   * Two calls: the `link` header of a first request gives the number of the
   * last page, which contains the initial commit. Walking the whole history
   * would cost one call per hundred commits.
   */
  async firstCommitDate(repoRef: RepoRef): Promise<string | null> {
    const base = `${this.base}/repos/${repoRef.owner}/${repoRef.repo}/commits?per_page=1`;
    type Commit = { commit: { committer: { date: string } | null } };

    return this.apiLimiter.run(async () => {
      try {
        const first = await this.http.get<Commit[]>(base, {
          headers: this.buildHeaders(),
        });

        const link = first.headers.get("link");
        const last = link?.match(/[?&]page=(\d+)>;\s*rel="last"/)?.[1];
        // without a `link` header, the repo fits in one page: the first commit
        // is the one just received
        if (!last) return first.body?.[0]?.commit.committer?.date ?? null;

        const lastPage = await this.call<Commit[]>(`${base}&page=${last}`);
        return lastPage[0]?.commit.committer?.date ?? null;
      } catch {
        // a missing bound degrades the input, it must not prevent the view
        return null;
      }
    });
  }

  // --- writing ---
  //
  // Every write goes through the same queue as reads: GitHub's secondary
  // limits are shared, and a write counts more there.

  /**
   * Encodes in base64, which the API expects for a file's content.
   *
   * `btoa` alone is not enough: it treats its arguments as bytes and
   * corrupts any character outside Latin-1 **without throwing**. The
   * specification's content being in French, an « é » would be enough to produce an
   * unreadable file in the repo, without the slightest error to report it.
   */
  private toBase64(text: string): string {
    const bytes = new TextEncoder().encode(text);
    let binary = "";
    for (const o of bytes) binary += String.fromCharCode(o);
    return btoa(binary);
  }

  private async send<T>(
    url: string,
    httpMethod: "POST" | "PUT" | "PATCH" | "DELETE",
    body: unknown,
  ): Promise<T> {
    const suspended = this.writeSuspended();
    if (suspended) throw new GithubError(suspended, 0);
    return this.apiLimiter.run(async () => {
      try {
        const response = await this.http.request<T>(httpMethod, url, {
          body: body,
          headers: this.buildHeaders(),
        });
        const remaining = response.headers.get("x-ratelimit-remaining");
        if (remaining !== null) this.quotaRemaining.set(Number(remaining));
        return response.body as T;
      } catch (e) {
        if (e instanceof HttpErrorResponse) {
          const remaining = e.headers?.get("x-ratelimit-remaining");
          if (remaining !== null && remaining !== undefined)
            this.quotaRemaining.set(Number(remaining));
        }
        throw this.toGithubError(e, true);
      }
    });
  }

  /**
   * Creates a branch from a commit.
   *
   * An existing branch makes the call fail with a 422, which the caller must
   * handle: it is the sign that a scoping with the same identifier is already in
   * progress, and overwriting it would lose its work.
   */
  async createBranch(
    repoRef: RepoRef,
    name: string,
    fromSha: string,
  ): Promise<void> {
    await this.send(
      `${this.base}/repos/${repoRef.owner}/${repoRef.repo}/git/refs`,
      "POST",
      {
        ref: `refs/heads/${name}`,
        sha: fromSha,
      },
    );
  }

  /** SHA of a branch's tip. */
  async branchSha(repoRef: RepoRef, branch: string): Promise<string> {
    const ref = await this.call<{ object: { sha: string } }>(
      `${this.base}/repos/${repoRef.owner}/${repoRef.repo}/git/ref/heads/${encodeURIComponent(branch)}`,
    );
    return ref.object.sha;
  }

  /**
   * Writes a file on a branch, and returns the SHA of the produced commit.
   *
   * `currentSha` is the SHA of the replaced blob, mandatory for a modification:
   * it is the API's concurrency check. Without it, two authors
   * silently overwrite each other's work.
   */
  async commitFile(
    repoRef: RepoRef,
    branch: string,
    path: string,
    content: string,
    message: string,
    currentSha?: string,
  ): Promise<{ commit: string; file: string }> {
    const url =
      `${this.base}/repos/${repoRef.owner}/${repoRef.repo}/contents/` +
      path.split("/").map(encodeURIComponent).join("/");

    const response = await this.send<{
      commit: { sha: string };
      content: { sha: string };
    }>(url, "PUT", {
      message,
      content: this.toBase64(content),
      branch: branch,
      ...(currentSha ? { sha: currentSha } : {}),
      ...this.commitAuthor(),
    });

    // The write already returns the file's new SHA, the one the next write
    // will have to build on. Rereading it would be a race lost in advance:
    // the branch reference may not have moved yet, and the caller
    // would then write on an outdated version.
    return { commit: response.commit.sha, file: response.content.sha };
  }

  /**
   * Deletes a file on a branch.
   *
   * `currentSha` is mandatory, as for writing: without it the platform
   * refuses, and fortunately so — deleting a version one has not read
   * would erase someone else's work without seeing it.
   */
  async deleteFile(
    repoRef: RepoRef,
    branch: string,
    path: string,
    currentSha: string,
    message: string,
  ): Promise<void> {
    const url =
      `${this.base}/repos/${repoRef.owner}/${repoRef.repo}/contents/` +
      path.split("/").map(encodeURIComponent).join("/");
    await this.send(url, "DELETE", {
      message,
      sha: currentSha,
      branch: branch,
      ...this.commitAuthor(),
    });
  }

  /** Opens a pull request and returns its number. */
  async createPullRequest(
    repoRef: RepoRef,
    branch: string,
    base: string,
    title: string,
    body: string,
    draft = false,
  ): Promise<number> {
    const pr = await this.send<{ number: number }>(
      `${this.base}/repos/${repoRef.owner}/${repoRef.repo}/pulls`,
      "POST",
      { title: title, body: body, head: branch, base, draft: draft },
    );
    return pr.number;
  }

  /**
   * Author to put on the commit, when an identity is known.
   *
   * Without it, every save would appear signed by the application
   * installed on the repo, and traceability — which is the product's
   * reason for being — would disappear. See RG-auteur-reel-commit.
   *
   * The platform accepts an email without an account with it: this is what makes
   * attribution possible for someone who has no account there. The
   * application then only appears as committer, not as author.
   */
  private commitAuthor(): { author?: { name: string; email: string } } {
    const who = this.tokens.identity();
    if (!who?.email) return {};
    return { author: { name: who.name, email: who.email } };
  }

  /**
   * The open pull requests, with the branch they carry.
   *
   * That is where in-progress scopings live: a draft or in-review
   * scoping is never on the default branch — it arrives there on its
   * delivery. Reading only that branch amounts to showing only finished
   * scopings, that is, not the ones being worked on.
   */
  async listOpenPullRequests(
    repoRef: RepoRef,
  ): Promise<readonly OpenPullRequest[]> {
    // GraphQL first: it returns the reviewers' decision with the rest, in one
    // point. REST would require one call per request — `/pulls/{n}/reviews` —
    // against the secondary limits the application already regulates.
    try {
      const { repository } = await this.graphql<{
        repository: {
          pullRequests: {
            nodes: Array<{
              number: number;
              isDraft: boolean;
              reviewDecision: ReviewDecision | null;
              headRefName: string;
            }>;
          };
        } | null;
      }>(
        `query($owner:String!,$repo:String!){
          repository(owner:$owner,name:$repo){
            pullRequests(states:OPEN,first:100,orderBy:{field:UPDATED_AT,direction:DESC}){
              nodes{ number isDraft reviewDecision headRefName }
            }
          }
        }`,
        { owner: repoRef.owner, repo: repoRef.repo },
      );

      const nodes = repository?.pullRequests?.nodes;
      if (nodes) {
        return nodes.map((p) => ({
          number: p.number,
          branch: p.headRefName,
          draft: p.isDraft,
          approval: p.reviewDecision,
        }));
      }
    } catch {
      // GraphQL unavailable — a token without the scope it requires, for instance.
      // We fall back on REST, which will tell everything but the approval.
    }

    const url =
      `${this.base}/repos/${repoRef.owner}/${repoRef.repo}/pulls` +
      "?state=open&per_page=100&sort=updated&direction=desc";
    try {
      const prs =
        await this.call<
          Array<{ number: number; draft: boolean; head: { ref: string } }>
        >(url);
      // `approval: null` and not "not approved": REST did not read it. An
      // approved scoping will show as in review, which is the cautious direction.
      return prs.map((p) => ({
        number: p.number,
        branch: p.head.ref,
        draft: p.draft,
        approval: null,
      }));
    } catch {
      // Without access, or on a repo that has none: the specification stays
      // browsable, only the in-progress scopings are missing.
      return [];
    }
  }

  /**
   * The open issues labelled `piste`: the project's roadmap (scoping
   * 2026-058, RG-piste-definition).
   *
   * The issues endpoint also returns pull requests, which are
   * issues like any other there: they are set aside here, a pull request not
   * being able to be a roadmap item. Pages follow one another as long as they are full.
   */
  async listRoadmapItems(repoRef: RepoRef): Promise<readonly RawIssue[]> {
    const issues: RawIssue[] = [];
    for (let page = 1; ; page++) {
      const url =
        `${this.base}/repos/${repoRef.owner}/${repoRef.repo}/issues` +
        `?labels=piste&state=open&per_page=100&page=${page}`;
      const read = await this.call<RawIssue[]>(url);
      issues.push(...read.filter((i) => !i.pull_request));
      if (read.length < 100) return issues;
    }
  }

  /** Number and state of the pull request open on a branch. */
  async findPullRequestForBranch(
    repoRef: RepoRef,
    branch: string,
  ): Promise<{ number: number; draft: boolean } | null> {
    const url =
      `${this.base}/repos/${repoRef.owner}/${repoRef.repo}/pulls` +
      `?head=${encodeURIComponent(`${repoRef.owner}:${branch}`)}&state=open&per_page=1`;
    try {
      const prs =
        await this.call<Array<{ number: number; draft: boolean }>>(url);
      const pr = prs[0];
      return pr ? { number: pr.number, draft: pr.draft } : null;
    } catch {
      // not finding the pull request degrades the reflection, it must not prevent
      // writing the status, which is the only source of truth
      return null;
    }
  }

  /**
   * Toggles a pull request between draft and ready for review.
   *
   * Goes through GraphQL, not REST: **`PATCH` accepts `draft` and silently
   * ignores it** — verified, the pull request stays in its state without any
   * error being reported. A reflection that reflects nothing would be worse than no
   * reflection at all.
   */
  async toggleDraftPullRequest(
    repoRef: RepoRef,
    number: number,
    draft: boolean,
  ): Promise<void> {
    const { repository } = await this.graphql<{
      repository: { pullRequest: { id: string } | null } | null;
    }>(
      `query($owner:String!,$repo:String!,$n:Int!){
        repository(owner:$owner,name:$repo){pullRequest(number:$n){id}}
      }`,
      { owner: repoRef.owner, repo: repoRef.repo, n: number },
    );

    const id = repository?.pullRequest?.id;
    if (!id) throw new GraphqlError(githubText().pullRequestNotFound(number));

    const mutation = draft
      ? "convertPullRequestToDraft"
      : "markPullRequestReadyForReview";
    await this.graphql(
      `mutation($id:ID!){${mutation}(input:{pullRequestId:$id}){pullRequest{isDraft}}}`,
      { id },
    );
  }

  /**
   * The scoping branches, in their two forms: `cadrage-<id>` and
   * `cadrage/<id>` (RG-cadrages-en-cours-visibles).
   *
   * A single call, whatever their number: `matching-refs` filters server
   * side, on the prefix common to both forms. This is what makes a started
   * scoping visible, one that has no pull request yet. The name only
   * designates the branches to read: the scoping found there is what attaches
   * them.
   *
   * Returns an empty list rather than failing: not seeing in-progress
   * scopings degrades the list, it must not prevent reading the specification.
   */
  async listScopingBranches(repoRef: RepoRef): Promise<string[]> {
    return (await this.listBranches(repoRef, "cadrage")).filter((b) =>
      /^cadrage[-/]/.test(b),
    );
  }

  /**
   * The paths a branch has changed since it left `base`.
   *
   * Compares the branch to its starting point, not to the current state of `base`:
   * what it inherited does not appear, only what it added or
   * modified. A branch already merged through a merge commit has nothing left
   * of its own, and returns an empty list.
   */
  async listBranchPaths(
    repoRef: RepoRef,
    base: string,
    branch: string,
  ): Promise<string[]> {
    const ref = (b: string) => b.split("/").map(encodeURIComponent).join("/");
    const comparison = await this.call<{
      files?: Array<{ filename: string }>;
    }>(
      `${this.base}/repos/${repoRef.owner}/${repoRef.repo}/compare/${ref(base)}...${ref(branch)}`,
    );
    return (comparison.files ?? []).map((f) => f.filename);
  }

  /**
   * The branches whose name starts with `prefix`, in one call.
   *
   * Returns an empty list rather than failing, for the same reason.
   */
  async listBranches(repoRef: RepoRef, prefix: string): Promise<string[]> {
    try {
      const refs = await this.call<Array<{ ref: string }>>(
        `${this.base}/repos/${repoRef.owner}/${repoRef.repo}/git/matching-refs/heads/` +
          prefix.split("/").map(encodeURIComponent).join("/"),
      );
      return refs.map((r) => r.ref.replace(/^refs\/heads\//, ""));
    } catch {
      return [];
    }
  }

  /**
   * Content of a file and SHA of its blob, on a given branch.
   *
   * The SHA is what the API requires to replace existing content: it says
   * which version the write builds on. Without it, two authors silently
   * overwrite each other's work — with it, the second receives a
   * conflict that can be presented to them.
   */
  async loadEditableFile(
    repoRef: RepoRef,
    path: string,
    branch: string,
  ): Promise<{ content: string; sha: string }> {
    const url =
      `${this.base}/repos/${repoRef.owner}/${repoRef.repo}/contents/` +
      path.split("/").map(encodeURIComponent).join("/") +
      `?ref=${encodeURIComponent(branch)}`;

    const raw = await this.call<{
      content: string;
      sha: string;
      encoding: string;
    }>(url);
    // the content comes in base64: decode it as UTF-8, otherwise accents are
    // lost exactly as `btoa` would lose them on write
    const binary = atob(raw.content.replace(/\s/g, ""));
    const bytes = Uint8Array.from(binary, (c) => c.charCodeAt(0));
    return { content: new TextDecoder().decode(bytes), sha: raw.sha };
  }

  /** The repo's metadata — used to check that it exists and to read its branch. */
  async loadRepo(
    repoRef: RepoRef,
  ): Promise<{ defaultBranch: string; description: string | null }> {
    const url = `${this.base}/repos/${repoRef.owner}/${repoRef.repo}`;
    const raw = await this.call<{
      default_branch: string;
      description: string | null;
    }>(url);
    return {
      defaultBranch: raw.default_branch,
      description: raw.description,
    };
  }

  /**
   * The repos the current access grants rights to.
   *
   * Two endpoints depending on the kind of access: a personal token
   * belongs to someone and answers about their repos; an access obtained by
   * identity exchange has no user and answers about those of the
   * installation.
   *
   * `affiliation` is mandatory and its default misleading: without it, organisation
   * repos are omitted even though the access grants rights to them. An
   * incomplete list is worse than no list — it leads to concluding that a repo is
   * not authorised.
   */
  async listAllowedRepos(): Promise<readonly RepoRef[]> {
    if (!this.tokens.present()) return [];

    const pages: RepoRef[] = [];
    for (let page = 1; page <= 5; page++) {
      const batch = await this.reposPage(page);
      pages.push(...batch);
      // An incomplete page is the last one; stopping avoids a call for nothing.
      if (batch.length < 100) break;
    }
    return pages;
  }

  /**
   * The repos that all known tokens together reach.
   *
   * Every token is queried, not only the current token: it only covers
   * the organisation of the open repo, and sticking to it would make
   * other organisations' projects invisible — exactly the ones sought when
   * one wants to switch project.
   */
  // A scope "org" or "org/repo" designates a fictitious repo sufficient for
  // the service to choose the right token.
  private scopeToRepo(key: string): RepoRef {
    const [owner, repo] = key.split("/");
    return { owner, repo: repo ?? "" };
  }

  /**
   * Asks the platform what a token opens, without saving it.
   *
   * A token restricted to a selection of repos is refused without a readable reason
   * when one opens a repo it does not cover: « introuvable » on a very
   * real repo. Showing it at input time avoids looking for the cause
   * elsewhere.
   */
  async tryToken(token: string): Promise<readonly string[]> {
    const url =
      `${this.base}/user/repos` +
      "?affiliation=owner,collaborator,organization_member&sort=updated&per_page=100";
    const response = await fetch(url, {
      headers: {
        Authorization: `Bearer ${token}`,
        Accept: "application/vnd.github+json",
      },
    });

    if (response.status === 401) {
      throw new Error(githubText().triedTokenRefused);
    }
    if (!response.ok) {
      // An installation token has no user: the other endpoint
      // answers then, and it is a legitimate use.
      const installation = await fetch(
        `${this.base}/installation/repositories?per_page=100`,
        {
          headers: {
            Authorization: `Bearer ${token}`,
            Accept: "application/vnd.github+json",
          },
        },
      );
      if (!installation.ok) {
        throw new Error(githubText().triedTokenStatus(response.status));
      }
      const raw = (await installation.json()) as {
        repositories: Array<{ full_name: string }>;
      };
      return raw.repositories.map((d) => d.full_name);
    }

    const raw = (await response.json()) as Array<{ full_name: string }>;
    return raw.map((d) => d.full_name);
  }

  async listReposAllTokens(): Promise<readonly RepoRef[]> {
    const target = this.tokens.currentTarget();
    const scopes = this.tokens.scopes().map((p) => p.key);
    // The null target returns the general token, if it exists.
    const toQuery: Array<string | null> = [null, ...scopes];

    const seen = new Map<string, RepoRef>();
    try {
      for (const key of toQuery) {
        this.tokens.targetRepo(key === null ? null : this.scopeToRepo(key));
        if (!this.tokens.present()) continue;
        for (const d of await this.listAllowedRepos()) {
          seen.set(`${d.owner.toLowerCase()}/${d.repo.toLowerCase()}`, d);
        }
      }
    } finally {
      // The target is shared state: leaving it moved would present the
      // wrong token at the next load.
      this.tokens.targetRepo(target);
    }
    return [...seen.values()];
  }

  private async reposPage(page: number): Promise<RepoRef[]> {
    const shared = `per_page=100&page=${page}`;
    try {
      const raw = await this.call<
        Array<{ owner: { login: string }; name: string }>
      >(
        `${this.base}/user/repos?affiliation=owner,collaborator,organization_member&sort=updated&${shared}`,
      );
      return raw.map((d) => ({ owner: d.owner.login, repo: d.name }));
    } catch (e) {
      // An installation access has no user: the platform refuses
      // the previous call, and the other endpoint is the one that answers.
      if (e instanceof GithubError && (e.status === 403 || e.status === 401)) {
        const raw = await this.call<{
          repositories: Array<{ owner: { login: string }; name: string }>;
        }>(`${this.base}/installation/repositories?${shared}`);
        return raw.repositories.map((d) => ({
          owner: d.owner.login,
          repo: d.name,
        }));
      }
      throw e;
    }
  }

  /**
   * Says whether a repo carries a specification, without loading it.
   *
   * One call per repo, through the ordinary queue: this is what
   * allows telling a scoping repo from a code repo, which the name alone does not
   * reveal.
   *
   * Under this repo's token, not the open project's: presented to another
   * organisation, the latter gets « introuvable », and its specifications
   * passed for code repos.
   */
  async isScopingRepo(repoRef: RepoRef): Promise<boolean> {
    try {
      await this.call(
        `${this.base}/repos/${repoRef.owner}/${repoRef.repo}/contents/ssk-canon.yml`,
        undefined,
        repoRef,
      );
      return true;
    } catch {
      // Absent, empty, or out of reach: in every case, not a specification
      // one could open.
      return false;
    }
  }
}
