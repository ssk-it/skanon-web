import { HttpClient, HttpErrorResponse, HttpHeaders } from "../http/http";
import { inject } from "../injection";
import { signal } from "../signaux";
import { RateLimiter } from "./rate-limiter";
import { TokenService } from "./token.service";
import { ReviewDecision } from "../model/model";

/**
 * Une demande de fusion ouverte, telle que la liste des cadrages en cours la lit.
 *
 * `approbation` vaut `null` quand personne ne s'est prononcé, mais aussi quand
 * la lecture n'a pas pu l'obtenir : l'appelant ne doit donc jamais en conclure
 * qu'une validation a été refusée, seulement qu'elle n'est pas établie.
 */
export interface OpenPullRequest {
  readonly number: number;
  readonly branch: string;
  readonly draft: boolean;
  readonly approval: ReviewDecision | null;
}

/** Une entrée de l'arborescence Git. */
export interface TreeEntry {
  readonly path: string;
  readonly sha: string;
  readonly type: "blob" | "tree";
  readonly size?: number;
}

export interface Tree {
  /**
   * Le commit résolu, non l'objet arbre : interrogé sur une branche ou sur
   * `HEAD`, `git/trees` répond avec le SHA du commit-ish demandé. C'est ce qui
   * permet de lire les contenus à un commit figé sans appel supplémentaire.
   */
  readonly sha: string;
  readonly entries: readonly TreeEntry[];
  /** Vrai si l'API a tronqué la réponse — jamais atteint sur du Markdown. */
  readonly truncated: boolean;
  /** L'étiquette de la réponse, pour redemander l'arborescence sous condition. */
  readonly etag: string | null;
}

/** Une arborescence déjà lue, à redemander sous condition. */
export interface KnownTree {
  readonly etag: string | null;
  readonly commit: string;
  readonly entries: readonly TreeEntry[];
  readonly truncated: boolean;
}

/** Un commit, tel que résolu depuis une date. */
export interface CommitDate {
  readonly sha: string;
  readonly date: string | null;
  readonly title: string;
}

/** Coordonnées d'un dépôt de projet. */
/** Une issue telle que la rend l'API REST, réduite à ce que l'application en lit. */
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
  /** Branche, tag ou SHA. Par défaut la branche par défaut du dépôt. */
  readonly ref?: string;
}

/**
 * Erreur remontée dans le corps d'une réponse GraphQL.
 *
 * GraphQL répond `200` même en cas d'échec, l'erreur vivant dans un tableau
 * `errors` du corps. La gestion d'erreurs HTTP ne la verrait donc jamais : sans
 * ce contrôle, une requête refusée passerait pour une réponse vide.
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
 * Accès à l'API GitHub.
 *
 * Point d'entrée unique et isolé : en phase 7, seul `entetes()` changera pour
 * relayer par le proxy avec le jeton d'installation. Le reste de l'application
 * n'en saura rien.
 */
export class GithubClient {
  private readonly http = inject(HttpClient);
  private readonly tokens = inject(TokenService);
  /**
   * Deux files distinctes, parce que les deux voies n'ont pas les mêmes
   * contraintes. L'API est soumise aux limites secondaires — cent requêtes
   * concurrentes pour l'installation entière — d'où une valeur prudente.
   * `raw.githubusercontent` n'a pas de quota : le brider revenait à ralentir le
   * chargement sans rien protéger. Mesuré : passer de 6 à 24 divise le temps de
   * chargement par deux sur un dépôt de soixante fichiers.
   */
  private readonly apiLimiter = new RateLimiter(6);
  private readonly rawLimiter = new RateLimiter(24);
  private readonly base = "https://api.github.com";

  /** Quota restant tel que rapporté par la dernière réponse. */
  readonly quotaRemaining = signal<number | null>(null);

  /**
   * Pourquoi les écritures sont suspendues, s'il y a lieu.
   *
   * Posé tant que l'application affiche un état que le dépôt n'a pas confirmé :
   * une écriture fondée sur une version dont on ignore si elle est courante
   * produirait le conflit, ou l'écrasement, que la lecture préalable existe pour
   * éviter. Voir RG-dernier-etat-connu. Toutes les écritures passant par
   * `send`, c'est là qu'elles sont refusées.
   */
  readonly writeSuspended = signal<string | null>(null);

  /**
   * Charger les contenus par l'API plutôt que par raw.
   *
   * Deux raisons de le vouloir, une de ne pas le faire par défaut :
   *
   * - Les dépôts privés ne sont pas servis par raw. Obligatoire pour eux.
   * - Mais un chargement coûte alors une requête par fichier au lieu d'une
   *   seule. Sans jeton, le quota de soixante par heure y passe d'un coup.
   *
   * La fraîcheur n'en fait plus partie : les contenus sont demandés à `raw` au
   * SHA du commit et non au nom de la branche, si bien que le `max-age: 300`
   * porte sur une URL immuable. Voir `RepoLoader.loadReferentiel`.
   *
   * Reste donc désactivé par défaut, et n'a de sens qu'avec un jeton.
   */
  readonly contentsViaApi = signal(false);

  useApiForContents(active: boolean): void {
    this.contentsViaApi.set(active);
  }

  private buildHeaders(repoRef?: RepoRef): HttpHeaders {
    // Le jeton vient du service dédié, jamais du stockage directement : en
    // phase 7, le proxy fournira un jeton d'installation et cette méthode ne
    // changera pas d'une ligne.
    let headers = new HttpHeaders({
      Accept: "application/vnd.github+json",
      "X-GitHub-Api-Version": "2022-11-28",
    });
    const token = repoRef ? this.tokens.valueFor(repoRef) : this.tokens.value();
    if (token) headers = headers.set("Authorization", `Bearer ${token}`);
    return headers;
  }

  /**
   * `depot` choisit le jeton d'après ce dépôt plutôt que d'après la cible
   * courante — pour un appel qui porte sur un autre projet que celui ouvert.
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
        // GitHub renvoie l'en-tête de quota sur les erreurs aussi, et c'est
        // justement là qu'il compte : sans cette lecture, l'application ne sait
        // plus où elle en est au moment précis où elle est bloquée.
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
   * Traduit une erreur GraphQL en message affichable.
   *
   * Les messages de GitHub sont en anglais et parlent de résolution de schéma :
   * « Could not resolve to a Repository ». Tels quels, ils décrivent la mécanique
   * plutôt que ce que le lecteur doit faire.
   *
   * `NOT_FOUND` mérite une attention particulière : GitHub répond la même chose
   * pour un dépôt inexistant et pour un dépôt que le jeton n'atteint pas — ne
   * pas distinguer un privé d'un absent est délibéré de sa part, et le message
   * doit donc couvrir les deux cas sans en affirmer un.
   */
  private toGraphqlError(error: {
    message: string;
    type?: string;
  }): GraphqlError {
    if (error.type === "NOT_FOUND") {
      return new GraphqlError(
        "Dépôt introuvable, ou hors de portée du jeton. Vérifier son nom, et " +
          "que le jeton donne accès à ce dépôt — GitHub ne distingue pas les deux cas.",
        error.type,
      );
    }
    if (error.type === "RATE_LIMITED") {
      return new GraphqlError(
        "Le budget de requêtes d’historique est épuisé pour cette heure. " +
          "Il se réinitialise automatiquement.",
        error.type,
      );
    }
    if (error.type === "FORBIDDEN") {
      return new GraphqlError(
        "Le jeton n’autorise pas cette lecture. Vérifier qu’il couvre ce dépôt.",
        error.type,
      );
    }
    return new GraphqlError(error.message, error.type);
  }

  private toGithubError(e: unknown, writing = false): GithubError {
    if (!(e instanceof HttpErrorResponse)) {
      return new GithubError("Erreur inattendue lors de l’appel à GitHub.", 0);
    }
    const remaining = e.headers?.get("x-ratelimit-remaining");
    const quotaExhausted = e.status === 403 && remaining === "0";

    if (quotaExhausted) {
      return new GithubError(
        this.tokens.present()
          ? "Le quota d’appels GitHub est épuisé pour cette heure. " +
              "Il se réinitialise automatiquement."
          : "Le quota d’appels GitHub est épuisé. Sans connexion, il est de 60 " +
              "requêtes par heure et par adresse.",
        403,
        true,
      );
    }
    // Un jeton refusé doit se dire tel quel : sans ce cas, l'utilisateur lirait
    // un message parlant de quota alors que son jeton est expiré ou révoqué.
    if (e.status === 401) {
      // Sans jeton, parler d'un jeton expiré enverrait en chercher un qui
      // n'existe pas. La cause est l'absence, non l'invalidité.
      return new GithubError(
        this.tokens.present()
          ? "GitHub a refusé le jeton. Il est peut-être expiré, révoqué, ou saisi " +
              "incomplètement. Se reconnecter avec un jeton valide."
          : "Cette opération demande une connexion. Se connecter, puis réessayer.",
        401,
      );
    }
    // Un 403 qui n'est pas un quota épuisé désigne un droit manquant. GitHub
    // répond ainsi lorsqu'un jeton en lecture seule tente d'écrire, ce qui est
    // le cas courant : la connexion conseillée pour consulter ne suffit pas
    // pour rédiger, et « GitHub a répondu 403 » ne le dirait pas.
    if (e.status === 403) {
      return new GithubError(
        "Le jeton n’autorise pas cette opération. Écrire dans le dépôt demande " +
          "un jeton avec la permission Contents en lecture et écriture, ainsi " +
          "que Pull requests pour ouvrir une demande de fusion.",
        403,
      );
    }
    if (e.status === 404) {
      // Sans connexion, la plateforme répond 404 à une écriture qu'elle
      // refuserait — elle ne révèle pas ce qui existe à qui n'y a pas droit.
      // Parler d'un dépôt introuvable enverrait chercher une erreur de nom là
      // où il manque simplement une connexion.
      if (writing && !this.tokens.present()) {
        return new GithubError(
          "Écrire dans le dépôt demande une connexion. Se connecter, puis réessayer.",
          404,
        );
      }
      return new GithubError(
        this.tokens.present()
          ? "Dépôt ou fichier introuvable. Vérifier le nom du dépôt, et que le " +
              "jeton donne accès à ce dépôt."
          : "Dépôt ou fichier introuvable. Vérifier le nom du dépôt, et qu’il " +
              "est public — un dépôt privé demande de se connecter.",
        404,
      );
    }
    // À une écriture, le 409 dit que la version lue n'est plus la dernière :
    // quelqu'un a enregistré entre-temps (RG-reprise-cadrage). Parler d'un
    // dépôt vide enverrait déposer un README là où il faut recharger.
    if (e.status === 409 && writing) {
      return new GithubError(
        "Le fichier a été modifié entre-temps, par une autre personne ou un " +
          "autre onglet. Recharger la page pour repartir de sa dernière " +
          "version, puis reprendre la modification.",
        409,
      );
    }
    // Un dépôt créé mais sans aucun enregistrement : sa branche par défaut est
    // annoncée sans exister. Le cas se rencontre au premier usage d'un projet,
    // et « le dépôt n'a pas pu être chargé » n'aiderait pas à en sortir.
    if (e.status === 409) {
      return new GithubError(
        "Ce dépôt est vide. Y déposer un premier fichier — un README suffit — " +
          "pour que l’application puisse le lire.",
        409,
      );
    }
    if (e.status === 0) {
      return new GithubError(
        "GitHub est injoignable. Vérifier la connexion réseau.",
        0,
      );
    }
    return new GithubError(`GitHub a répondu ${e.status}.`, e.status);
  }

  /**
   * Arborescence complète en un appel.
   *
   * GraphQL n'est pas utilisable ici : `Tree.entries` n'est ni récursif ni
   * paginé. C'est l'un des cas où REST est obligatoire.
   */
  async loadTree(repoRef: RepoRef, known?: KnownTree | null): Promise<Tree> {
    const ref = repoRef.ref ?? "HEAD";
    const url = `${this.base}/repos/${repoRef.owner}/${repoRef.repo}/git/trees/${ref}?recursive=1`;

    // Sous condition seulement avec un jeton : la plateforme ne décompte pas
    // alors une réponse « inchangé », mais elle la décompte sans connexion —
    // mesuré. Anonyme, la condition ne ferait qu'ajouter un cas sans rien
    // épargner.
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
          // Inchangée : l'arborescence connue est l'arborescence courante, et
          // la plateforme vient de le confirmer.
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
   * Contenu d'un fichier.
   *
   * Deux voies, et le choix a une conséquence directe sur le quota :
   *
   * - `raw.githubusercontent.com` n'est **pas** décompté du quota de l'API, sert
   *   CORS et honore les requêtes conditionnelles. C'est la voie normale pour un
   *   dépôt public : charger cinquante fichiers coûte alors zéro requête de
   *   quota, contre cinquante par l'API. Vérifié, pas supposé.
   * - L'API `git/blobs` fonctionne sur les dépôts privés avec un jeton, mais
   *   consomme une requête par fichier.
   *
   * Le quota anonyme étant de soixante requêtes par heure et par adresse IP, la
   * première voie est ce qui rend la lecture d'un dépôt réel praticable sans
   * authentification. En phase 7, les dépôts privés basculeront sur la seconde.
   */
  async loadContent(
    repoRef: RepoRef,
    path: string,
    sha: string,
  ): Promise<string> {
    if (!this.contentsViaApi()) {
      // `depot.ref` porte de préférence un SHA de commit : l'appelant a déjà
      // résolu la branche, et une URL de branche serait servie depuis le cache
      // pendant cinq minutes après une écriture.
      const ref = repoRef.ref ?? "HEAD";
      const url = `https://raw.githubusercontent.com/${repoRef.owner}/${repoRef.repo}/${ref}/${path}`;
      try {
        return await this.rawLimiter.run(() =>
          this.http.get(url, { responseType: "text" }).then((r) => r.body),
        );
      } catch (e) {
        // Le canal non décompté ne dessert pas les dépôts privés : il répond 404
        // même pour qui y a droit. Basculer sur l'autre plutôt que d'annoncer un
        // fichier absent — un dépôt privé se lit, au prix d'un appel par fichier.
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
   * Contenu d'un blob par son SHA, via l'API.
   *
   * Adresser par SHA plutôt que par chemin fonctionne quel que soit le commit et
   * rend le cache trivial : un SHA identifie un contenu, pour toujours.
   */
  async loadBlob(repoRef: RepoRef, sha: string): Promise<string> {
    const url = `${this.base}/repos/${repoRef.owner}/${repoRef.repo}/git/blobs/${sha}`;

    return this.apiLimiter.run(async () => {
      // Le contenu d'un fichier n'est pas du JSON : sans `responseType`, Angular
      // tente de l'analyser comme tel et échoue sur une réponse pourtant valide.
      // Le media type brut évite au passage le décodage base64 et son inflation.
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

  // --- identité d'un projet ---
  //
  // Chaque appel se fait sous l'accès du dépôt nommé, non sous celui du projet
  // ouvert : l'accueil lit l'identité de projets d'autres organisations.

  /**
   * Les entrées à la racine d'un dépôt, redemandées sous condition.
   *
   * Retourne `null` quand la racine n'a pas changé depuis `etag` : sous un
   * accès, la plateforme ne décompte pas cette réponse. Le point d'entrée des
   * contenus, et non `git/trees` : celui-ci rend le commit résolu, qui change à
   * chaque écriture et sa marque avec lui, là où la liste de la racine ne
   * change que si l'un de ses répertoires change.
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
          // Un dépôt vide, ou une réponse inattendue : rien à la racine.
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
   * Les fichiers d'un répertoire désigné par son empreinte.
   *
   * Une empreinte désigne un contenu pour toujours : ce qui a été lu sous elle
   * n'est jamais à redemander.
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

  /** Les octets d'un blob, par l'API : une image n'est pas du texte. */
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
   * Les octets d'un fichier par le canal non décompté, au nom de la branche
   * par défaut. `null` s'il n'existe pas.
   *
   * `HEAD` désigne la branche par défaut sans qu'il faille la connaître : la
   * résoudre coûterait un appel décompté par projet listé, sur soixante par
   * heure. C'est l'exception que RG-lecture-identite assume à la lecture au
   * commit.
   *
   * Le canal n'expose pas sa marque au script, et refuse la pré-requête
   * qu'un `If-None-Match` posé à la main déclencherait — mesuré. La condition
   * est donc laissée au navigateur : `no-cache` lui fait revalider sa copie
   * avec la marque qu'il détient, et une réponse inchangée ne rapatrie rien.
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
   * Date du premier commit ayant touché un chemin — la création de l'objet.
   *
   * L'histoire n'est jamais stockée dans les fichiers : elle se dérive de Git.
   * C'est donc l'API qui répond, et l'appel est fait à la demande plutôt qu'au
   * chargement, pour ne pas faire payer à chaque visite un coût proportionnel au
   * nombre de cadrages.
   *
   * Retourne `null` plutôt que d'échouer : une date manquante dégrade
   * l'affichage, elle ne doit pas empêcher la lecture.
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
      // l'API retourne du plus récent au plus ancien : la création est en fin
      return commits.at(-1)?.commit?.committer?.date ?? null;
    } catch {
      return null;
    }
  }

  /**
   * Requête GraphQL.
   *
   * Mesuré sur `ssk-canon` : l'historique complet d'une règle — dates, auteurs,
   * pull requests — coûte **un point**, contre autant d'appels REST que de
   * commits. Les deux budgets sont séparés et cumulables, 5000 chacun par heure.
   *
   * GraphQL n'accepte aucun appel anonyme, contrairement à REST : sans jeton, il
   * répond 403 quel que soit le dépôt, fût-il public. L'appel est donc refusé
   * ici même, avec un message qui dit quoi faire — laisser partir la requête ne
   * produirait qu'une erreur plus obscure.
   */
  async graphql<T>(
    query: string,
    variables: Record<string, unknown>,
  ): Promise<T> {
    if (!this.tokens.present()) {
      throw new GithubError(
        "Cette vue interroge l’historique, ce que GitHub ne permet qu’aux " +
          "requêtes authentifiées. Se connecter avec un jeton pour y accéder.",
        403,
      );
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
        if (!body?.data)
          throw new GraphqlError("GitHub a répondu sans donnée.");
        return body.data;
      } catch (e) {
        if (e instanceof GraphqlError) throw e;
        throw this.toGithubError(e);
      }
    });
  }

  /**
   * Dernier commit antérieur ou égal à une date.
   *
   * Un seul appel : `until` demande à GitHub de filtrer, et `per_page=1` de ne
   * rendre que le plus récent des commits retenus. Reconstituer le référentiel
   * à cette date coûte ensuite un appel pour l'arborescence — les contenus étant
   * servis hors quota, y compris adressés par SHA.
   *
   * Retourne `null` si le dépôt n'a aucun commit à cette date, ce qui arrive
   * pour une date antérieure à sa création.
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
   * Date du commit le plus ancien du dépôt.
   *
   * Sert de borne basse à toute consultation datée : avant elle, il n'y a rien à
   * reconstituer. La date de création du dépôt ne conviendrait pas — il peut
   * rester vide un moment, et l'écart a été mesuré à plus de deux heures sur le
   * dépôt de référence.
   *
   * Deux appels : l'en-tête `link` d'une première requête donne le numéro de la
   * dernière page, qui contient le commit initial. Parcourir l'historique
   * entier coûterait un appel par centaine de commits.
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
        // sans en-tête `link`, le dépôt tient en une page : le premier commit
        // est celui qu'on vient de recevoir
        if (!last) return first.body?.[0]?.commit.committer?.date ?? null;

        const lastPage = await this.call<Commit[]>(`${base}&page=${last}`);
        return lastPage[0]?.commit.committer?.date ?? null;
      } catch {
        // une borne absente dégrade la saisie, elle ne doit pas empêcher la vue
        return null;
      }
    });
  }

  // --- écriture ---
  //
  // Toute écriture passe par la même file que les lectures : les limites
  // secondaires de GitHub sont partagées, et une écriture y compte davantage.

  /**
   * Encode en base64, ce qu'attend l'API pour un contenu de fichier.
   *
   * `btoa` seul ne suffit pas : il traite ses arguments comme des octets et
   * corrompt tout caractère hors Latin-1 **sans lever**. Le contenu du
   * référentiel étant en français, un « é » suffirait à produire un fichier
   * illisible dans le dépôt, sans la moindre erreur pour le signaler.
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
   * Crée une branche à partir d'un commit.
   *
   * Une branche existante fait échouer l'appel avec un 422, que l'appelant doit
   * traiter : c'est le signe qu'un cadrage du même identifiant est déjà en
   * cours, et l'écraser ferait perdre son travail.
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

  /** SHA du sommet d'une branche. */
  async branchSha(repoRef: RepoRef, branch: string): Promise<string> {
    const ref = await this.call<{ object: { sha: string } }>(
      `${this.base}/repos/${repoRef.owner}/${repoRef.repo}/git/ref/heads/${encodeURIComponent(branch)}`,
    );
    return ref.object.sha;
  }

  /**
   * Écrit un fichier sur une branche, et retourne le SHA du commit produit.
   *
   * `shaActuel` est le SHA du blob remplacé, obligatoire pour une modification :
   * c'est le contrôle de concurrence de l'API. Sans lui, deux rédacteurs
   * écrasent silencieusement le travail l'un de l'autre.
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

    // L'écriture rend déjà le nouveau SHA du fichier, celui sur lequel la
    // prochaine devra se fonder. Le relire serait une course perdue d'avance :
    // la référence de branche peut n'avoir pas encore bougé, et l'appelant
    // écrirait alors sur une version périmée.
    return { commit: response.commit.sha, file: response.content.sha };
  }

  /**
   * Supprime un fichier sur une branche.
   *
   * `shaActuel` est obligatoire, comme pour l'écriture : sans lui la plateforme
   * refuse, et c'est heureux — supprimer une version qu'on n'a pas lue
   * effacerait le travail de quelqu'un d'autre sans le voir.
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

  /** Ouvre une pull request et retourne son numéro. */
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
   * Auteur à porter au commit, lorsqu'une identité est connue.
   *
   * Sans cela, tous les enregistrements paraîtraient signés par l'application
   * installée sur le dépôt, et la traçabilité — qui est la raison d'être du
   * produit — disparaîtrait. Voir RG-auteur-reel-commit.
   *
   * La plateforme accepte un courriel sans compte chez elle : c'est ce qui rend
   * l'attribution possible pour quelqu'un qui n'y a pas de compte. Elle
   * n'apparaît alors qu'en tant que déposant, non comme auteur.
   */
  private commitAuthor(): { author?: { name: string; email: string } } {
    const who = this.tokens.identity();
    if (!who?.email) return {};
    return { author: { name: who.name, email: who.email } };
  }

  /**
   * Les demandes de fusion ouvertes, avec la branche qu'elles portent.
   *
   * C'est là que vivent les cadrages en cours : un cadrage en brouillon ou en
   * relecture n'est jamais sur la branche par défaut — il y arrive à sa
   * livraison. Ne lire que celle-ci revient à ne montrer que les cadrages
   * terminés, c'est-à-dire pas ceux sur lesquels on travaille.
   */
  async listOpenPullRequests(
    repoRef: RepoRef,
  ): Promise<readonly OpenPullRequest[]> {
    // GraphQL d'abord : il rend la décision des relecteurs avec le reste, en un
    // point. REST l'imposerait un appel par demande — `/pulls/{n}/reviews` —
    // contre les limites secondaires que l'application régule déjà.
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
      // GraphQL indisponible — un jeton sans la portée qu'il exige, par exemple.
      // On retombe sur REST, qui dira tout sauf l'approbation.
    }

    const url =
      `${this.base}/repos/${repoRef.owner}/${repoRef.repo}/pulls` +
      "?state=open&per_page=100&sort=updated&direction=desc";
    try {
      const prs =
        await this.call<
          Array<{ number: number; draft: boolean; head: { ref: string } }>
        >(url);
      // `approbation: null` et non « pas approuvée » : REST ne l'a pas lue. Un
      // cadrage validé se montrera en relecture, ce qui est le sens prudent.
      return prs.map((p) => ({
        number: p.number,
        branch: p.head.ref,
        draft: p.draft,
        approval: null,
      }));
    } catch {
      // Sans accès, ou sur un dépôt qui n'en a aucune : le référentiel reste
      // consultable, seuls les cadrages en cours manquent.
      return [];
    }
  }

  /**
   * Les issues ouvertes étiquetées `piste` : la roadmap du projet (cadrage
   * 2026-058, RG-piste-definition).
   *
   * Le point d'entrée des issues rend aussi les demandes de fusion, qui y
   * sont des issues comme les autres : elles s'écartent ici, une demande ne
   * pouvant être une piste. Les pages se suivent tant qu'elles sont pleines.
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

  /** Numéro et état de la demande de fusion ouverte sur une branche. */
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
      // ne pas trouver la demande dégrade le reflet, cela ne doit pas empêcher
      // d'écrire le statut, qui est la seule source de vérité
      return null;
    }
  }

  /**
   * Bascule une demande de fusion entre brouillon et prête à relire.
   *
   * Passe par GraphQL, et non par REST : **`PATCH` accepte `draft` et l'ignore
   * silencieusement** — vérifié, la demande reste dans son état sans qu'aucune
   * erreur ne soit remontée. Un reflet qui ne reflète rien serait pire que pas
   * de reflet du tout.
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
    if (!id) throw new GraphqlError(`Demande de fusion ${number} introuvable.`);

    const mutation = draft
      ? "convertPullRequestToDraft"
      : "markPullRequestReadyForReview";
    await this.graphql(
      `mutation($id:ID!){${mutation}(input:{pullRequestId:$id}){pullRequest{isDraft}}}`,
      { id },
    );
  }

  /**
   * Les branches de cadrage, sous leurs deux formes : `cadrage-<id>` et
   * `cadrage/<id>` (RG-cadrages-en-cours-visibles).
   *
   * Un seul appel, quel que soit leur nombre : `matching-refs` filtre côté
   * serveur, sur le préfixe commun aux deux formes. C'est ce qui rend visible un
   * cadrage commencé, qui n'a pas encore de demande de fusion. Le nom ne fait
   * que désigner les branches à lire : c'est le cadrage qu'on y trouve qui les
   * rattache.
   *
   * Retourne une liste vide plutôt que d'échouer : ne pas voir les cadrages en
   * cours dégrade la liste, cela ne doit pas empêcher de lire le référentiel.
   */
  async listScopingBranches(repoRef: RepoRef): Promise<string[]> {
    return (await this.listBranches(repoRef, "cadrage")).filter((b) =>
      /^cadrage[-/]/.test(b),
    );
  }

  /**
   * Les chemins qu'une branche a changés depuis qu'elle a quitté `base`.
   *
   * Compare la branche à son point de départ, non à l'état actuel de `base` :
   * ce qu'elle a hérité n'y figure pas, seulement ce qu'elle a ajouté ou
   * modifié. Une branche déjà fusionnée par un commit de fusion n'a plus rien
   * en propre, et rend une liste vide.
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
   * Les branches dont le nom commence par `prefixe`, en un appel.
   *
   * Retourne une liste vide plutôt que d'échouer, pour la même raison.
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
   * Contenu d'un fichier et SHA de son blob, sur une branche donnée.
   *
   * Le SHA est ce que l'API exige pour remplacer un contenu existant : il dit
   * sur quelle version l'écriture se fonde. Sans lui, deux rédacteurs écrasent
   * silencieusement le travail l'un de l'autre — avec lui, le second reçoit un
   * conflit qu'on peut lui présenter.
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
    // le contenu vient en base64 : le décoder en UTF-8, sinon les accents sont
    // perdus exactement comme `btoa` les perdrait à l'écriture
    const binary = atob(raw.content.replace(/\s/g, ""));
    const bytes = Uint8Array.from(binary, (c) => c.charCodeAt(0));
    return { content: new TextDecoder().decode(bytes), sha: raw.sha };
  }

  /** Métadonnées du dépôt — sert à vérifier qu'il existe et à lire sa branche. */
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
   * Les dépôts auxquels l'accès courant donne droit.
   *
   * Deux points d'entrée selon la nature de l'accès : un jeton personnel
   * appartient à quelqu'un et répond sur ses dépôts ; un accès obtenu par
   * échange d'identité n'a pas d'utilisateur et répond sur ceux de
   * l'installation.
   *
   * `affiliation` est obligatoire et son défaut trompeur : sans lui, les dépôts
   * d'organisation sont omis alors que l'accès y donne droit. Une liste
   * incomplète est pire qu'aucune liste — elle fait conclure qu'un dépôt n'est
   * pas autorisé.
   */
  async listAllowedRepos(): Promise<readonly RepoRef[]> {
    if (!this.tokens.present()) return [];

    const pages: RepoRef[] = [];
    for (let page = 1; page <= 5; page++) {
      const batch = await this.reposPage(page);
      pages.push(...batch);
      // Une page incomplète est la dernière ; s'arrêter évite un appel pour rien.
      if (batch.length < 100) break;
    }
    return pages;
  }

  /**
   * Les dépôts que l'ensemble des jetons connus atteint.
   *
   * Chaque jeton est interrogé, non le seul jeton courant : celui-ci ne couvre
   * que l'organisation du dépôt ouvert, et s'y limiter rendrait invisibles les
   * projets des autres organisations — exactement ceux qu'on cherche quand on
   * veut changer de projet.
   */
  // Une portée « org » ou « org/depot » désigne un dépôt fictif suffisant pour
  // que le service choisisse le bon jeton.
  private scopeToRepo(key: string): RepoRef {
    const [owner, repo] = key.split("/");
    return { owner, repo: repo ?? "" };
  }

  /**
   * Demande à la plateforme ce qu'un jeton ouvre, sans l'enregistrer.
   *
   * Un jeton restreint à une sélection de dépôts est refusé sans motif lisible
   * quand on ouvre un dépôt qu'il ne couvre pas : « introuvable » sur un dépôt
   * bien réel. Le montrer au moment de la saisie évite d'en chercher la cause
   * ailleurs.
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
      throw new Error(
        "Ce jeton est refusé par GitHub — expiré, ou mal recopié.",
      );
    }
    if (!response.ok) {
      // Un jeton d'installation n'a pas d'utilisateur : l'autre point d'entrée
      // répond alors, et c'est un usage légitime.
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
        throw new Error(`GitHub a répondu ${response.status} à ce jeton.`);
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
    // La cible nulle rend le jeton général, s'il existe.
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
      // La cible est un état partagé : la laisser déplacée ferait présenter le
      // mauvais jeton au chargement suivant.
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
      // Un accès d'installation n'a pas d'utilisateur : la plateforme refuse
      // l'appel précédent, et c'est l'autre point d'entrée qui répond.
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
   * Dit si un dépôt porte un référentiel, sans le charger.
   *
   * Un appel par dépôt, passé par la file d'attente ordinaire : c'est ce qui
   * permet de distinguer un dépôt cadré d'un dépôt de code, que le nom seul ne
   * révèle pas.
   *
   * Sous le jeton de ce dépôt, non celui du projet ouvert : présenté à une
   * autre organisation, celui-ci obtient « introuvable », et ses référentiels
   * passaient pour des dépôts de code.
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
      // Absent, vide, ou hors de portée : dans tous les cas, pas un référentiel
      // qu'on saurait ouvrir.
      return false;
    }
  }
}
