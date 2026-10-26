import { inject } from "../injection";
import { computed, signal } from "../signals";
import { DEFAULT_NAMES, scopingFolder } from "./repo-names";
import { UnconfirmedState, RepoLoader } from "./repo-loader";
import { ContentCache } from "./content-cache";
import { deriveStatus } from "./derived-status";
import { RepoConfig } from "./repo-config";
import { repoText } from "./repo.messages";
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
 * The application's state: the loaded specification, and the cross views that
 * files alone do not give.
 */
export class SpecificationStore {
  private readonly loader = inject(RepoLoader);
  private readonly config = inject(RepoConfig);
  private readonly github = inject(GithubClient);
  private readonly tokens = inject(TokenService);
  private readonly cache = inject(ContentCache);

  readonly state = signal<LoadState>("vide");

  /**
   * Present when the displayed specification is the last one read, the repo
   * having not responded. See RG-dernier-etat-connu.
   */
  readonly unconfirmed = signal<UnconfirmedState | null>(null);

  constructor() {
    // Once the network is back, the state is read again by itself: the mark
    // need not wait for the reader to think of reloading.
    if (typeof window !== "undefined") {
      window.addEventListener("online", () => {
        if (this.unconfirmed()) void this.loadSpecification();
      });
    }
  }
  readonly error = signal<string | null>(null);

  /**
   * True as long as scopings in progress are being read on their branches.
   *
   * Their read follows that of the specification, without blocking it: a view
   * presenting them must be able to say they are coming, rather than let one
   * believe there are none.
   */
  readonly loadingBranches = signal(false);
  readonly progression = signal<{ loadedCount: number; total: number } | null>(
    null,
  );
  readonly specification = signal<Specification>(EMPTY);

  readonly repoRef = this.config.repoRef;

  /**
   * The names of the repo's folders and conventional files, the format's
   * until the specification says otherwise — RG-noms-declares.
   */
  readonly names = computed(() => this.specification().names ?? DEFAULT_NAMES);

  // --- derived views ---

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
   * Sorted by lifecycle, then by descending identifier.
   *
   * Draft first, delivered last: what needs attention comes ahead of what is
   * already a reference. At equal status, the most recent first — the
   * identifier carrying the year and the sequence, it gives that order without
   * any date being needed, and stays stable where a title gets reworded.
   */
  readonly scopings = computed(() =>
    [...this.specification().scopings.values()].sort((a, b) => {
      const byStatus = LIFECYCLE_ORDER[a.status] - LIFECYCLE_ORDER[b.status];
      return byStatus !== 0 ? byStatus : b.id.localeCompare(a.id);
    }),
  );

  /** True if the repo exists but carries no record yet. */
  readonly emptyRepo = signal(false);

  /**
   * True if the repo remained not found under a personal token.
   *
   * The platform responds this way, with no other reason, to a token that does
   * not cover the repo — the common case of a token restricted to a selection
   * of repos. It is fixed in the token's settings, which the error screen then
   * points to. Not under a temporary access: that one is not set in one's
   * tokens, but in the installation of the registered application.
   */
  readonly tokenWithoutAccess = signal(false);

  readonly activeRules = computed(() =>
    this.rules().filter((r) => r.status === "actif"),
  );

  /** The link kinds the input offers. See `unionLinkTags`. */
  readonly linkTags = computed(() =>
    unionLinkTags(
      this.specification().settings.linkTags,
      this.specification().scopings.values(),
    ),
  );

  /** Counts undelivered scopings — what is being worked on right now. */
  readonly scopingsInProgress = computed(() =>
    this.scopings().filter((c) => c.status !== "livree"),
  );

  // --- single accessors ---

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

  // --- cross views: what justifies the tool ---

  /** Features attached to a domain. */
  listFeaturesByDomain(domainId: string) {
    return this.features().filter((f) => f.domains.includes(domainId));
  }

  /** Rules attached to a feature. */
  listRulesByFeature(featureId: string) {
    return this.rules().filter((r) => r.features.includes(featureId));
  }

  /**
   * Scopings attached to a domain, in lifecycle order.
   *
   * The attachment is the one the scoping declares, not a link rebuilt from
   * its impacts: a scoping may touch no rule — describe an architecture, for
   * example — and concern the domain all the same. Deriving it from impacts
   * would make it disappear from the page of the domain it documents, and
   * nothing would report the absence.
   */
  listScopingsByDomain(domainId: string) {
    return this.scopings().filter((c) => c.domains.includes(domainId));
  }

  /**
   * Scopings that declared an impact on a rule, with the operation.
   * This is the rule → decision trace, the product's promise.
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
   * Flows that touch a component.
   *
   * Computed from the documents themselves, never from a list kept on the
   * component: that list would be wrong at the first added flow, and its
   * inaccuracy would not show — a component does not look incomplete.
   *
   * Restricted to flows: a context document cites components too, but it
   * cites them all, and would drown the view one came to consult.
   */
  listFlowsByComponent(componentId: string) {
    return this.architecture().filter(
      (d) => d.kind === "flux" && d.components.includes(componentId),
    );
  }

  /** Architecture documents of a given kind. */
  listArchitectureByKind(kind: DocumentKind) {
    return this.architecture().filter((d) => d.kind === kind);
  }

  /**
   * Scopings that declared an impact on a target, whatever its kind.
   *
   * `kind` removes the ambiguity when the same identifier designates a rule and
   * an architecture target: nothing forbids it, and it is the kind that tells
   * them apart, not the name.
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

  /** Domains a rule belongs to, through its features. */
  listDomainsByRule(rule: Rule): string[] {
    const ids = new Set<string>();
    for (const featId of rule.features) {
      for (const domId of this.findFeature(featId)?.domains ?? [])
        ids.add(domId);
    }
    return [...ids];
  }

  /**
   * Targets impacted by a scoping, resolved, in declaration order.
   *
   * The statement is found through the targeted identifier, whatever the kind:
   * reading `rule` would leave every architecture impact, whose field is empty,
   * without a statement. The statement would exist in the scoping without being
   * displayed anywhere — a defect nothing reports, since an absent section goes
   * unnoticed.
   */
  listTargetsByScoping(scoping: Scoping) {
    return scoping.impacts.map((i) => ({
      impact: i,
      /** The target as the specification carries it, or `null` if it does not exist yet. */
      target: this.findTarget(i),
      /** Statement carried by this scoping — may differ from the current statement. */
      statement: scoping.statements.get(i.target) ?? null,
    }));
  }

  /** What an impact targets, looked up in the collection its kind designates. */
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

  // --- creation dates, derived from Git history ---

  /**
   * Creation dates by scoping identifier.
   *
   * Loaded on demand, never when the specification loads: one call per
   * scoping would make every visit pay a cost proportional to the number of
   * scopings, on a quota of sixty for a reader not signed in.
   *
   * A `null` entry means « requested but unavailable » and will not be
   * requested again; an absent entry means « not requested yet ».
   */
  private readonly dates = signal<ReadonlyMap<string, string | null>>(
    new Map(),
  );
  private readonly inProgressForDate = new Set<string>();

  creationDate(scopingId: string): string | null | undefined {
    return this.dates().get(scopingId);
  }

  /**
   * Requests a scoping's creation date if it is not already known.
   * No effect if it is, or if a request is in flight.
   */
  async loadCreationDate(scopingId: string): Promise<void> {
    if (this.dates().has(scopingId) || this.inProgressForDate.has(scopingId))
      return;
    this.inProgressForDate.add(scopingId);
    try {
      const date = await this.github.creationDate(
        this.config.repoRef(),
        scopingFolder(this.names(), scopingId),
      );
      this.dates.update((m) => new Map(m).set(scopingId, date));
    } finally {
      this.inProgressForDate.delete(scopingId);
    }
  }

  /** Requests the dates of several scopings, in parallel bounded by the client. */
  async loadCreationDates(ids: readonly string[]): Promise<void> {
    await Promise.all(ids.map((id) => this.loadCreationDate(id)));
  }

  // --- loading ---

  /** Load in progress, if there is one. Allows waiting for it. */
  private pending: Promise<void> | null = null;

  /** Waits for the end of the load in progress, if there is one. */
  async waitReady(): Promise<void> {
    await this.pending;
  }

  loadSpecification(repoRef?: RepoRef): Promise<void> {
    this.pending = this.runLoad(repoRef);
    return this.pending;
  }

  /**
   * Adds to the specification the scopings carried by pull requests.
   *
   * Each branch is read as a whole specification, then only its scopings are
   * kept: the read is thus written only once, and a branch that also modifies
   * rules does not disturb the current state, which stays that of the main
   * branch.
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
      // Without the list of open branches, we do not know what the cache must
      // keep: better to remove nothing.
      return;
    }

    // Scoping branches without a pull request: a scoping just started has none
    // yet, and reading only pull requests would make it invisible before its
    // first review (RG-cadrages-en-cours-visibles).
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
            : // Without a pull request, the scoping is a draft.
              { branch, draft: true };
          const scopings = [...onBranch.specification.scopings.values()].map(
            (c) =>
              // The loader returns « livree » for lack of knowing where it reads from;
              // it is here that this is known, and the provenance that decides.
              ({ ...c, provenance, status: deriveStatus(provenance) }),
          );
          return {
            branch: branch,
            scopings,
            fingerprints: onBranch.fingerprints,
          };
        } catch {
          // An unreadable branch must not take down the others nor the
          // specification: it is simply absent from the list.
          return {
            branch: branch,
            scopings: [],
            fingerprints: new Set<string>(),
          };
        }
      }),
    );

    // Another read may have started in the meantime, on this repo or another:
    // what follows only holds for the one that started these branches.
    if (read !== this.reads) return;

    const current = this.specification();
    const merged = new Map(current.scopings);
    for (const c of batches.flatMap((l) => l.scopings)) {
      // The main branch is authoritative: a scoping it already carries is
      // delivered, and its branch version would add nothing.
      if (!merged.has(c.id)) merged.set(c.id, c);
    }

    if (merged.size !== current.scopings.size) {
      this.specification.set({ ...current, scopings: merged });
    }

    // A branch whose scopings are all already delivered adds nothing to the
    // specification; it may outlive a merge, and is then reported.
    const withoutScopingInProgress = batches
      .filter(
        (l) =>
          l.scopings.length > 0 &&
          l.scopings.every((c) => current.scopings.has(c.id)),
      )
      .map((l) => l.branch);
    await this.flagStaleBranches(repoRef, withoutScopingInProgress, read);

    // The cache follows the specification in force: the main branch and the
    // open branches. An unreadable branch has what it holds of its own
    // removed, and requests it again on the next load (2026-043, decision 04).
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
   * Reports on each delivered scoping the branches that still carry it
   * (RG-branches-survivantes-signalees).
   *
   * A branch inherits every scoping delivered before it: it is what it has
   * added or modified since it started that says which scoping is its own, not
   * its name. A branch merged by a merge commit has nothing of its own left,
   * and is therefore not reported. A comparison that fails reports nothing:
   * the report informs, it is not essential.
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
      // Only a delivered scoping has stale branches: that of a scoping in
      // progress is simply its branch.
      if (!c || c.provenance) continue;
      scopings.set(id, {
        ...c,
        staleBranches: stale.sort((a, b) => a.localeCompare(b)),
      });
    }
    this.specification.set({ ...current, scopings });
  }

  /** Counts the reads started, so that a superseded read no longer acts. */
  private reads = 0;

  private async runLoad(repoRef?: RepoRef): Promise<void> {
    const read = ++this.reads;
    if (repoRef) this.config.saveRepo(repoRef);
    const target = this.config.repoRef();

    // Before any read: this is what decides which token will be presented. An
    // author working across several organisations has one per organisation,
    // and presenting another's would produce « introuvable » on a very real
    // repo.
    this.tokens.targetRepo(target);

    this.state.set("chargement");
    this.loadingBranches.set(false);
    this.error.set(null);
    this.unconfirmed.set(null);
    this.github.writeSuspended.set(null);
    this.emptyRepo.set(false);
    this.tokenWithoutAccess.set(false);
    this.progression.set(null);
    // the dates belong to the repo being left
    this.dates.set(new Map());

    try {
      const result = await this.loader.readSpecification(target, {
        progression: (loadedCount, total) =>
          this.progression.set({ loadedCount, total }),
        remember: true,
        lastKnownState: true,
      });
      this.specification.set(result.specification);
      // As soon as the project is read: a token it requires protected must not stay in clear for the time of another action (RG-protection-du-jeton-par-projet).
      this.tokens.requireProtection(
        result.specification.settings.tokenProtection,
      );
      this.state.set("pret");

      if (result.unconfirmed) {
        // An unconfirmed state is read, not written. Branches are not read: the
        // repo that did not respond for the main branch will not respond for them
        // either.
        this.unconfirmed.set(result.unconfirmed);
        this.github.writeSuspended.set(repoText().repoNotAnswering);
        return;
      }

      // Scopings in progress live on the branches of their pull requests, never
      // on the main one: without this read, the tool would only show finished
      // scopings. Afterwards and without blocking — the specification is already
      // readable, and this only completes it.
      void this.loadScopingsOnBranches(target, result.fingerprints, read);
      // Remembered afterwards, not on request: a repo that could not be loaded
      // has no place in the list of open projects. This also covers the startup
      // one, which nobody « changed ».
      this.config.rememberOpened(target);
    } catch (e) {
      this.specification.set(EMPTY);
      this.error.set(
        e instanceof GithubError ? e.message : repoText().loadFailed,
      );
      // Distinguished from other failures: this one can be fixed, and the
      // application knows how. See BootstrapService.
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
 * The link kinds to offer: the project's, then those in use.
 *
 * The kind being free at input, a value invented once must come back by
 * itself in the list, otherwise everyone would retype it — and « ticket-jira »
 * would end up next to « ticket_jira » with nothing bringing them together.
 * The order keeps first what the project declared: those are its reference
 * kinds, and relegating them among incidental values would make them
 * indistinct.
 *
 * A free function rather than a method: it depends on no injection, and
 * testing it must not require building a store.
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
