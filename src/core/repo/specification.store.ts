import { inject } from "../injection";
import { computed, signal } from "../signals";
import { UnconfirmedState, RepoLoader } from "./repo-loader";
import { ContentCache } from "./content-cache";
import { deriveStatus } from "./derived-status";
import { RepoConfig } from "./repo-config";
import { TokenService } from "../github/token.service";
import { GithubClient, GithubError, RepoRef } from "../github/github-client";
import {
  Scoping,
  ArchitectureDecision,
  ArchitectureDocument,
  Impact,
  TargetKind,
  DocumentKind,
  ImpactOperation,
  LIFECYCLE_ORDER,
  ScopingProvenance,
  Specification,
  Rule,
  DEFAULT_LINK_TAGS,
} from "../model/model";

export type LoadState = "vide" | "chargement" | "pret" | "erreur";

const EMPTY: Specification = {
  project: { name: "", description: "", codeRepos: [], prefix: null },
  settings: {
    access: "jeton_personnel",
    identity: null,
    tokenProtection: "proposee",
    linkTags: DEFAULT_LINK_TAGS,
  },
  domains: new Map(),
  features: new Map(),
  rules: new Map(),
  decisions: new Map(),
  architecture: new Map(),
  scopings: new Map(),
  anomalies: [],
};

/**
 * L'état de l'application : le référentiel chargé, et les vues croisées que les
 * fichiers seuls ne donnent pas.
 */
export class SpecificationStore {
  private readonly loader = inject(RepoLoader);
  private readonly config = inject(RepoConfig);
  private readonly github = inject(GithubClient);
  private readonly tokens = inject(TokenService);
  private readonly cache = inject(ContentCache);

  readonly state = signal<LoadState>("vide");

  /**
   * Présent quand le référentiel affiché est le dernier lu, le dépôt n'ayant pas
   * répondu. Voir RG-dernier-etat-connu.
   */
  readonly unconfirmed = signal<UnconfirmedState | null>(null);

  constructor() {
    // Le réseau revenu, l'état se relit de lui-même : la marque n'a pas à
    // attendre que le lecteur pense à recharger.
    if (typeof window !== "undefined") {
      window.addEventListener("online", () => {
        if (this.unconfirmed()) void this.loadSpecification();
      });
    }
  }
  readonly error = signal<string | null>(null);

  /**
   * Vrai tant que les cadrages en cours se lisent sur leurs branches.
   *
   * Leur lecture suit celle du référentiel, sans la bloquer : une vue qui les
   * présente doit pouvoir dire qu'ils arrivent, plutôt que de laisser croire
   * qu'il n'y en a aucun.
   */
  readonly loadingBranches = signal(false);
  readonly progression = signal<{ loadedCount: number; total: number } | null>(
    null,
  );
  readonly specification = signal<Specification>(EMPTY);

  readonly repoRef = this.config.repoRef;

  // --- vues dérivées ---

  readonly domains = computed(() =>
    [...this.specification().domains.values()].sort((a, b) =>
      a.name.localeCompare(b.name, "fr"),
    ),
  );

  readonly features = computed(() =>
    [...this.specification().features.values()].sort((a, b) =>
      a.name.localeCompare(b.name, "fr"),
    ),
  );

  readonly rules = computed(() =>
    [...this.specification().rules.values()].sort((a, b) =>
      a.id.localeCompare(b.id),
    ),
  );

  readonly decisions = computed(() =>
    [...this.specification().decisions.values()].sort((a, b) =>
      a.id.localeCompare(b.id),
    ),
  );

  readonly architecture = computed(() =>
    [...this.specification().architecture.values()].sort((a, b) =>
      a.id.localeCompare(b.id),
    ),
  );

  /**
   * Triés selon le cycle de vie, puis par identifiant décroissant.
   *
   * Brouillon d'abord, livrée en dernier : ce qui demande de l'attention passe
   * devant ce qui fait déjà référence. À statut égal, le plus récent en tête —
   * l'identifiant portant l'année et la séquence, il donne cet ordre sans
   * qu'aucune date soit nécessaire, et reste stable là où un titre se reformule.
   */
  readonly scopings = computed(() =>
    [...this.specification().scopings.values()].sort((a, b) => {
      const byStatus = LIFECYCLE_ORDER[a.status] - LIFECYCLE_ORDER[b.status];
      return byStatus !== 0 ? byStatus : b.id.localeCompare(a.id);
    }),
  );

  /** Vrai si le dépôt existe mais ne porte encore aucun enregistrement. */
  readonly emptyRepo = signal(false);

  /**
   * Vrai si le dépôt est resté introuvable sous un jeton personnel.
   *
   * La plateforme répond ainsi, sans autre motif, à un jeton qui ne couvre pas
   * le dépôt — le cas courant d'un jeton restreint à une sélection de dépôts.
   * Il se répare dans les réglages du jeton, que l'écran d'erreur désigne alors.
   * Pas sous un accès temporaire : celui-là ne se règle pas dans ses jetons,
   * mais dans l'installation de l'application inscrite.
   */
  readonly tokenWithoutAccess = signal(false);

  readonly activeRules = computed(() =>
    this.rules().filter((r) => r.status === "actif"),
  );

  /** Les natures de lien que la saisie propose. Voir `unionTagsLiens`. */
  readonly linkTags = computed(() =>
    unionLinkTags(
      this.specification().settings.linkTags,
      this.specification().scopings.values(),
    ),
  );

  /** Compte les cadrages non livrés — ce sur quoi on travaille en ce moment. */
  readonly scopingsInProgress = computed(() =>
    this.scopings().filter((c) => c.status !== "livree"),
  );

  // --- accès unitaires ---

  findDomain(id: string) {
    return this.specification().domains.get(id) ?? null;
  }

  findFeature(id: string) {
    return this.specification().features.get(id) ?? null;
  }

  findRule(id: string) {
    return this.specification().rules.get(id) ?? null;
  }

  findScoping(id: string) {
    return this.specification().scopings.get(id) ?? null;
  }

  // --- vues croisées : ce qui justifie l'outil ---

  /** Fonctionnalités rattachées à un domaine. */
  listFeaturesByDomain(domainId: string) {
    return this.features().filter((f) => f.domains.includes(domainId));
  }

  /** Règles rattachées à une fonctionnalité. */
  listRulesByFeature(featureId: string) {
    return this.rules().filter((r) => r.features.includes(featureId));
  }

  /**
   * Cadrages rattachés à un domaine, dans l'ordre du cycle de vie.
   *
   * Le rattachement est celui que le cadrage déclare, non un lien reconstruit
   * depuis ses impacts : un cadrage peut ne toucher aucune règle — décrire une
   * architecture, par exemple — et concerner le domaine tout de même. Le
   * déduire des impacts le ferait disparaître de la fiche du domaine qu'il
   * documente, et rien ne signalerait l'absence.
   */
  listScopingsByDomain(domainId: string) {
    return this.scopings().filter((c) => c.domains.includes(domainId));
  }

  /**
   * Cadrages ayant déclaré un impact sur une règle, avec l'opération.
   * C'est la remontée règle → décision, la promesse du produit.
   */
  listScopingsImpactingRule(
    ruleId: string,
  ): Array<{ scoping: Scoping; operation: ImpactOperation }> {
    const out: Array<{ scoping: Scoping; operation: ImpactOperation }> = [];
    for (const c of this.scopings()) {
      const impact = c.impacts.find((i) => i.rule === ruleId);
      if (impact) out.push({ scoping: c, operation: impact.operation });
    }
    return out;
  }

  /**
   * Flux qui touchent un composant.
   *
   * Se calcule des documents eux-mêmes, jamais d'une liste tenue sur le
   * composant : celle-ci serait fausse au premier flux ajouté, et son
   * inexactitude ne se verrait pas — un composant n'a pas l'air incomplet.
   *
   * Restreint aux flux : un document de contexte cite lui aussi des composants,
   * mais il les cite tous, et il noierait la vue qu'on est venu consulter.
   */
  listFlowsByComponent(componentId: string) {
    return this.architecture().filter(
      (d) => d.kind === "flux" && d.components.includes(componentId),
    );
  }

  /** Documents d'architecture d'une nature donnée. */
  listArchitectureByKind(kind: DocumentKind) {
    return this.architecture().filter((d) => d.kind === kind);
  }

  /**
   * Cadrages ayant déclaré un impact sur une cible, quelle que soit sa nature.
   *
   * `nature` lève l'ambiguïté quand un même identifiant désigne une règle et
   * une cible d'architecture : rien ne l'interdit, et c'est la nature qui les
   * sépare, pas le nom.
   */
  listScopingsImpactingTarget(
    targetId: string,
    kind?: TargetKind,
  ): Array<{ scoping: Scoping; operation: ImpactOperation }> {
    const out: Array<{ scoping: Scoping; operation: ImpactOperation }> = [];
    for (const c of this.scopings()) {
      const impact = c.impacts.find(
        (i) => i.target === targetId && (kind === undefined || i.kind === kind),
      );
      if (impact) out.push({ scoping: c, operation: impact.operation });
    }
    return out;
  }

  findArchitectureDecision(id: string) {
    return this.specification().decisions.get(id) ?? null;
  }

  findArchitectureDocument(id: string) {
    return this.specification().architecture.get(id) ?? null;
  }

  /** Domaines auxquels une règle appartient, via ses fonctionnalités. */
  listDomainsByRule(rule: Rule): string[] {
    const ids = new Set<string>();
    for (const featId of rule.features) {
      for (const domId of this.findFeature(featId)?.domains ?? [])
        ids.add(domId);
    }
    return [...ids];
  }

  /**
   * Cibles impactées par un cadrage, résolues, dans l'ordre de déclaration.
   *
   * L'énoncé se retrouve par l'identifiant visé, quelle que soit la nature :
   * lire `regle` laisserait sans énoncé tout impact d'architecture, dont ce
   * champ est vide. L'énoncé existerait dans le cadrage sans être affiché nulle
   * part — un défaut que rien ne signale, puisqu'une section absente ne se
   * remarque pas.
   */
  listTargetsByScoping(scoping: Scoping) {
    return scoping.impacts.map((i) => ({
      impact: i,
      /** La cible telle que le référentiel la porte, ou `null` si elle n'existe pas encore. */
      target: this.findTarget(i),
      /** Énoncé porté par ce cadrage — peut différer de l'énoncé courant. */
      statement: scoping.statements.get(i.target) ?? null,
    }));
  }

  /** Ce qu'un impact vise, cherché dans la collection que sa nature désigne. */
  findTarget(
    impact: Impact,
  ): Rule | ArchitectureDecision | ArchitectureDocument | null {
    switch (impact.kind) {
      case "adr":
        return this.findArchitectureDecision(impact.target);
      case "architecture":
        return this.findArchitectureDocument(impact.target);
      default:
        return this.findRule(impact.target);
    }
  }

  // --- dates de création, dérivées de l'historique Git ---

  /**
   * Dates de création par identifiant de cadrage.
   *
   * Chargées à la demande, jamais au chargement du référentiel : un appel par
   * cadrage ferait payer à chaque visite un coût proportionnel au nombre de
   * cadrages, sur un quota de soixante pour un lecteur non connecté.
   *
   * Une entrée à `null` signifie « demandée mais indisponible » et ne sera pas
   * redemandée ; une entrée absente signifie « pas encore demandée ».
   */
  private readonly dates = signal<ReadonlyMap<string, string | null>>(
    new Map(),
  );
  private readonly inProgressForDate = new Set<string>();

  creationDate(scopingId: string): string | null | undefined {
    return this.dates().get(scopingId);
  }

  /**
   * Demande la date de création d'un cadrage si elle n'est pas déjà connue.
   * Sans effet si elle l'est, ou si une demande est en vol.
   */
  async loadCreationDate(scopingId: string): Promise<void> {
    if (this.dates().has(scopingId) || this.inProgressForDate.has(scopingId))
      return;
    this.inProgressForDate.add(scopingId);
    try {
      const date = await this.github.creationDate(
        this.config.repoRef(),
        `cadrages/${scopingId}`,
      );
      this.dates.update((m) => new Map(m).set(scopingId, date));
    } finally {
      this.inProgressForDate.delete(scopingId);
    }
  }

  /** Demande les dates de plusieurs cadrages, en parallèle borné par le client. */
  async loadCreationDates(ids: readonly string[]): Promise<void> {
    await Promise.all(ids.map((id) => this.loadCreationDate(id)));
  }

  // --- chargement ---

  /** Chargement en cours, s'il y en a un. Permet de l'attendre. */
  private pending: Promise<void> | null = null;

  /** Attend la fin du chargement en cours, s'il y en a un. */
  async waitReady(): Promise<void> {
    await this.pending;
  }

  loadSpecification(repoRef?: RepoRef): Promise<void> {
    this.pending = this.runLoad(repoRef);
    return this.pending;
  }

  /**
   * Ajoute au référentiel les cadrages portés par les demandes de fusion.
   *
   * Chaque branche est lue comme un référentiel entier, puis seuls ses cadrages
   * sont retenus : la lecture n'est ainsi écrite qu'une fois, et une branche qui
   * modifie aussi des règles ne trouble pas l'état courant, qui reste celui de
   * la branche principale.
   */
  private async loadScopingsOnBranches(
    repoRef: RepoRef,
    mainFingerprints: ReadonlySet<string>,
    read: number,
  ): Promise<void> {
    this.loadingBranches.set(true);
    try {
      await this.mergeScopingsOnBranches(repoRef, mainFingerprints, read);
    } finally {
      if (read === this.reads) this.loadingBranches.set(false);
    }
  }

  private async mergeScopingsOnBranches(
    repoRef: RepoRef,
    mainFingerprints: ReadonlySet<string>,
    read: number,
  ): Promise<void> {
    let requests;
    try {
      requests = await this.github.listOpenPullRequests(repoRef);
    } catch {
      // Sans la liste des branches ouvertes, on ne sait pas ce que le cache
      // doit garder : mieux vaut ne rien retirer.
      return;
    }

    // Les branches de cadrage sans demande de fusion : un cadrage commencé n'en
    // a pas encore, et ne lire que les demandes le rendrait invisible avant sa
    // première relecture (RG-cadrages-en-cours-visibles).
    const byPullRequest = new Set(requests.map((d) => d.branch));
    const withoutPullRequest = (
      await this.github.listScopingBranches(repoRef)
    ).filter((b) => !byPullRequest.has(b));
    const sources = [
      ...requests.map((d) => ({ branch: d.branch, request: d })),
      ...withoutPullRequest.map((branch) => ({
        branch: branch,
        request: null,
      })),
    ];

    const batches = await Promise.all(
      sources.map(async ({ branch, request }) => {
        try {
          const onBranch = await this.loader.readSpecification(
            { ...repoRef, ref: branch },
            { remember: true },
          );
          const provenance: ScopingProvenance = request
            ? {
                branch,
                pullRequest: request.number,
                draft: request.draft,
                approval: request.approval,
              }
            : // Sans demande de fusion, le cadrage est en brouillon.
              { branch, draft: true };
          const scopings = [...onBranch.specification.scopings.values()].map(
            (c) =>
              // Le chargeur rend « livree » faute de savoir d'où il lit ; c'est
              // ici qu'on le sait, et la provenance qui tranche.
              ({ ...c, provenance, status: deriveStatus(provenance) }),
          );
          return {
            branch: branch,
            scopings,
            fingerprints: onBranch.fingerprints,
          };
        } catch {
          // Une branche illisible ne doit pas emporter les autres ni le
          // référentiel : elle est simplement absente de la liste.
          return {
            branch: branch,
            scopings: [],
            fingerprints: new Set<string>(),
          };
        }
      }),
    );

    // Une autre lecture a pu commencer entre-temps, sur ce dépôt ou un autre :
    // ce qui suit ne vaut que pour celle qui a lancé ces branches.
    if (read !== this.reads) return;

    const current = this.specification();
    const merged = new Map(current.scopings);
    for (const c of batches.flatMap((l) => l.scopings)) {
      // La branche principale fait foi : un cadrage qu'elle porte déjà est
      // livré, et sa version de branche n'apporterait rien.
      if (!merged.has(c.id)) merged.set(c.id, c);
    }

    if (merged.size !== current.scopings.size) {
      this.specification.set({ ...current, scopings: merged });
    }

    // Une branche dont tous les cadrages sont déjà livrés n'apporte rien au
    // référentiel ; elle survit peut-être à une fusion, et se signale alors.
    const withoutScopingInProgress = batches
      .filter(
        (l) =>
          l.scopings.length > 0 &&
          l.scopings.every((c) => current.scopings.has(c.id)),
      )
      .map((l) => l.branch);
    await this.flagStaleBranches(repoRef, withoutScopingInProgress, read);

    // Le cache suit le référentiel en vigueur : la branche principale et les
    // branches ouvertes. Une branche illisible voit ce qu'elle a en propre
    // retiré, et le redemande au chargement suivant (2026-043, décision 04).
    const fingerprints = new Set(mainFingerprints);
    for (const l of batches)
      for (const e of l.fingerprints) fingerprints.add(e);
    const refs = new Set([
      repoRef.ref ?? "HEAD",
      ...sources.map((s) => s.branch),
    ]);
    await this.cache.pruneRepo(repoRef, fingerprints, refs);
  }

  /**
   * Signale sur chaque cadrage livré les branches qui le portent encore
   * (RG-branches-survivantes-signalees).
   *
   * Une branche hérite de tous les cadrages livrés avant elle : c'est ce
   * qu'elle a ajouté ou modifié depuis son départ qui dit quel cadrage est le
   * sien, non son nom. Une branche fusionnée par un commit de fusion n'a plus
   * rien en propre, et n'est donc pas signalée. Une comparaison qui échoue ne
   * signale rien : le signalement informe, il n'est pas indispensable.
   */
  private async flagStaleBranches(
    repoRef: RepoRef,
    branches: readonly string[],
    read: number,
  ): Promise<void> {
    if (!branches.length) return;
    let base: string;
    try {
      base = (await this.github.loadRepo(repoRef)).defaultBranch;
    } catch {
      return;
    }

    const byScoping = new Map<string, string[]>();
    await Promise.all(
      branches.map(async (branch) => {
        let paths: string[];
        try {
          paths = await this.github.listBranchPaths(repoRef, base, branch);
        } catch {
          return;
        }
        const ids = new Set(
          paths
            .map((c) => /^cadrages\/([^/]+)\//.exec(c)?.[1])
            .filter((id): id is string => !!id),
        );
        for (const id of ids) {
          byScoping.set(id, [...(byScoping.get(id) ?? []), branch]);
        }
      }),
    );
    if (read !== this.reads || !byScoping.size) return;

    const current = this.specification();
    const scopings = new Map(current.scopings);
    for (const [id, stale] of byScoping) {
      const c = scopings.get(id);
      // Seul un cadrage livré a des branches survivantes : celle d'un cadrage
      // en cours est sa branche, tout simplement.
      if (!c || c.provenance) continue;
      scopings.set(id, { ...c, staleBranches: stale.sort() });
    }
    this.specification.set({ ...current, scopings });
  }

  /** Compte les lectures lancées, pour qu'une lecture dépassée n'agisse plus. */
  private reads = 0;

  private async runLoad(repoRef?: RepoRef): Promise<void> {
    const read = ++this.reads;
    if (repoRef) this.config.saveRepo(repoRef);
    const target = this.config.repoRef();

    // Avant toute lecture : c'est ce qui décide quel jeton sera présenté. Un
    // rédacteur travaillant sur plusieurs organisations en a un par
    // organisation, et présenter celui d'une autre produirait « introuvable »
    // sur un dépôt bien réel.
    this.tokens.targetRepo(target);

    this.state.set("chargement");
    this.loadingBranches.set(false);
    this.error.set(null);
    this.unconfirmed.set(null);
    this.github.writeSuspended.set(null);
    this.emptyRepo.set(false);
    this.tokenWithoutAccess.set(false);
    this.progression.set(null);
    // les dates appartiennent au dépôt qu'on quitte
    this.dates.set(new Map());

    try {
      const result = await this.loader.readSpecification(target, {
        progression: (loadedCount, total) =>
          this.progression.set({ loadedCount, total }),
        remember: true,
        lastKnownState: true,
      });
      this.specification.set(result.specification);
      // Dès la lecture du projet : un jeton qu'il exige protégé ne doit pas rester en clair le temps d'un autre geste (RG-protection-du-jeton-par-projet).
      this.tokens.requireProtection(
        result.specification.settings.tokenProtection,
      );
      this.state.set("pret");

      if (result.unconfirmed) {
        // Un état non confirmé se lit, ne s'écrit pas. Les branches ne sont pas
        // lues : le dépôt qui n'a pas répondu pour la principale ne répondra
        // pas davantage pour elles.
        this.unconfirmed.set(result.unconfirmed);
        this.github.writeSuspended.set(
          "Le dépôt ne répond pas : l’état affiché est le dernier lu, et rien ne " +
            "peut s’y enregistrer avant qu’il ait été relu.",
        );
        return;
      }

      // Les cadrages en cours vivent sur les branches de leurs demandes de
      // fusion, jamais sur la principale : sans cette lecture, l'outil ne
      // montrerait que les cadrages terminés. Après coup et sans bloquer — le
      // référentiel est déjà consultable, et ceci ne fait que le compléter.
      void this.loadScopingsOnBranches(target, result.fingerprints, read);
      // Mémorisé après coup, non à la demande : un dépôt qu'on n'a pas su
      // charger n'a rien à faire dans la liste des projets ouverts. Cela couvre
      // aussi celui d'ouverture, que personne n'a « changé ».
      this.config.rememberOpened(target);
    } catch (e) {
      this.specification.set(EMPTY);
      this.error.set(
        e instanceof GithubError
          ? e.message
          : "Le chargement du dépôt a échoué.",
      );
      // Distingué des autres échecs : celui-ci se répare, et l'application sait
      // comment. Voir AmorcageService.
      this.emptyRepo.set(e instanceof GithubError && e.status === 409);
      this.tokenWithoutAccess.set(
        e instanceof GithubError &&
          e.status === 404 &&
          this.tokens.source() === "personnel",
      );
      this.state.set("erreur");
    } finally {
      this.progression.set(null);
    }
  }
}

/**
 * Les natures de lien à proposer : celles du projet, puis celles employées.
 *
 * La nature étant libre à la saisie, une valeur inventée une fois doit revenir
 * d'elle-même dans la liste, sans quoi chacun la retaperait — et « ticket-jira »
 * finirait par côtoyer « ticket_jira » sans que rien ne les rapproche. L'ordre
 * garde en tête ce que le projet a déclaré : ce sont ses natures de référence,
 * et les reléguer parmi les valeurs de circonstance les rendrait indistinctes.
 *
 * Fonction libre plutôt que méthode : elle ne dépend d'aucune injection, et
 * l'éprouver ne doit pas demander de construire un store.
 */
export function unionLinkTags(
  declared: readonly string[],
  scopings: Iterable<Scoping>,
): readonly string[] {
  const used = new Set<string>();
  for (const c of scopings) {
    for (const l of c.links) {
      const t = l.tag.trim();
      if (t) used.add(t);
    }
  }
  for (const d of declared) used.delete(d);
  return [...declared, ...[...used].sort((a, b) => a.localeCompare(b))];
}
