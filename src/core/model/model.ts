/**
 * The model of the specification and of scopings.
 *
 * Identifiers are stable, readable slugs, never UUIDs: they
 * appear in file paths and cross-links, and never
 * change. See RG-identifiants-stables.
 */

/**
 * A scoping's status is not declared: it is deduced from the repo's state.
 *
 * A `statut:` field in the frontmatter would be a second source for a fact
 * the platform already establishes, and that duplication is what had diverged.
 * The Action's checker now refuses a declared status.
 *
 * The main branch establishes delivery; the pull request carries the
 * rest of the cycle. See `deriveStatus` in `derived-status.ts`.
 */
export type ScopingStatus = "brouillon" | "en_relecture" | "validee" | "livree";
export type RuleStatus = "actif" | "abroge";
export type ImpactOperation = "cree" | "modifie" | "abroge" | "touche";
export type DecisionStatus = "ouverte" | "retenue" | "annulee";

export interface Domain {
  readonly id: string;
  readonly name: string;
  /** Markdown body: the description. */
  readonly description: string;
}

export interface Feature {
  readonly id: string;
  readonly name: string;
  readonly domains: readonly string[];
  readonly description: string;
}

export interface Rule {
  readonly id: string;
  readonly status: RuleStatus;
  readonly features: readonly string[];
  /** The statement, in Markdown. It is the content that matters. */
  readonly statement: string;
  /**
   * Indexes derived from history, written by propagation.
   * Never a source of truth — see RG-histoire-derivee.
   */
  readonly createdBy: string | null;
  readonly modifiedBy: readonly string[];
}

export interface ExternalLink {
  readonly tag: string;
  readonly url: string;
  /**
   * The displayed label, as entered.
   *
   * The tag only says the link's kind: two issues of the same scoping
   * would both announce themselves as « Issue GitHub », and nothing would tell them apart
   * without opening both. Empty on scopings written before this field, hence the
   * fallback on the tag's label at display.
   */
  readonly name: string;
}

/**
 * What an impact can target.
 *
 * `regle` says what the product does; `adr` and `architecture` say how it
 * is built. All three follow the same projection regime — see
 * RG-cible-impact.
 */
export type TargetKind = "regle" | "adr" | "architecture";

/** The kinds an architecture document can take — RG-architecture-flux-composants. */
export type DocumentKind = "composant" | "flux" | "contexte";

export interface Impact {
  /**
   * The targeted identifier, whatever its kind.
   *
   * `rule` is kept for scopings written before the impact could
   * target anything else: a removed field would make the whole history
   * already committed unreadable, which nothing will rewrite.
   */
  readonly target: string;
  readonly kind: TargetKind;
  readonly operation: ImpactOperation;
  /** @deprecated Read `target`. Present as long as scopings use it. */
  readonly rule: string;
}

/**
 * An architecture decision: why the system is built this way.
 *
 * Same shape as a rule, but for one detail — it is attached to no
 * feature. The functional specification is browsed by domains and
 * features; architecture is browsed through its own directory.
 */
export interface ArchitectureDecision {
  readonly id: string;
  readonly status: RuleStatus;
  readonly statement: string;
  readonly createdBy: string | null;
  readonly modifiedBy: readonly string[];
}

/**
 * An architecture document: component, flow, or overview.
 *
 * A flow references the components it connects rather than describing them. The
 * inverse relation — which flows touch this component — is computed from these
 * references, and is therefore kept nowhere.
 */
export interface ArchitectureDocument {
  readonly id: string;
  readonly kind: DocumentKind;
  readonly status: RuleStatus;
  /** The connected components, for a flow. Empty for a component or the context. */
  readonly components: readonly string[];
  readonly statement: string;
  readonly createdBy: string | null;
  readonly modifiedBy: readonly string[];
}

export interface Option {
  readonly id: string;
  readonly title: string;
  readonly chosen: boolean;
  readonly body: string;
}

export interface Decision {
  readonly id: string;
  readonly title: string;
  readonly status: DecisionStatus;
  readonly chosenOption: string | null;
  readonly description: string;
  readonly options: readonly Option[];
  /** The complete body, for raw display if splitting fails. */
  readonly body: string;
}

export interface Attachment {
  readonly name: string;
  readonly sha256: string;
  readonly size: number;
  readonly type: string;
  readonly addedAt: string | null;
}

/**
 * Where a not yet delivered scoping comes from.
 *
 * A draft or in-review scoping is never on the default
 * branch: it arrives there on delivery. Showing it without saying where it comes from
 * would suggest it is already part of the specification.
 */
export interface ScopingProvenance {
  readonly branch: string;
  /**
   * Absent for a branch that has no pull request yet: a
   * started scoping, in draft (RG-statuts-cadrage).
   */
  readonly pullRequest?: number;
  readonly draft: boolean;
  /**
   * The reviewers' decision, as the platform summarises it.
   *
   * `null` when nobody has given a verdict yet, or when the call that reads it
   * did not succeed: the scoping is then shown in review, never approved.
   * Asserting an approval that did not happen would be the only costly lie
   * of this derivation.
   */
  readonly approval?: ReviewDecision | null;
}

/** What GitHub summarises of the reviewers' opinion on a pull request. */
export type ReviewDecision =
  "APPROVED" | "CHANGES_REQUESTED" | "REVIEW_REQUIRED";

/**
 * A level-2 section the scoping template does not present on its own.
 *
 * A scoping carries what its author deems useful: a record of measurements, open
 * questions, a note. The editor already kept them on rewrite,
 * but the page showed them nowhere — written and invisible, which is
 * worse than refused.
 */
export interface MiscSection {
  readonly title: string;
  readonly body: string;
}

export interface Scoping {
  readonly id: string;
  readonly title: string;
  readonly status: ScopingStatus;
  readonly domains: readonly string[];
  readonly links: readonly ExternalLink[];
  readonly impacts: readonly Impact[];
  readonly goal: string;
  readonly journey: string;
  /** Statements carried by this scoping, indexed by rule identifier. */
  readonly statements: ReadonlyMap<string, string>;
  readonly decisions: readonly Decision[];
  readonly attachments: readonly Attachment[];
  /**
   * The sections the page gathers under « Divers », in their original
   * order.
   */
  readonly misc: readonly MiscSection[];
  /** Filled in for a scoping read from a branch, absent on the main one. */
  readonly provenance?: ScopingProvenance;
  /**
   * The branches that still carry this scoping, already delivered
   * (RG-branches-survivantes-signalees). Without effect, they are flagged so
   * that nobody picks them up believing they are working on an in-progress scoping.
   */
  readonly staleBranches?: readonly string[];
}

/**
 * How a project's authors obtain access to the repo.
 *
 * The three modes stack: each removes an obstacle the previous one left,
 * without cancelling what it brought. Moving from one to the other requires
 * reworking neither the specification nor the scopings — only the way of obtaining access
 * changes. See RG-modes-acces.
 */
export type AccessMode = "jeton_personnel" | "identite_tierce" | "relais";

/**
 * What each mode guarantees, and what it does not.
 *
 * These limits are imposed by the platform, not chosen: an installation
 * token is restricted to repos and permissions, never to paths.
 * Announcing them is what RG-garanties-annoncees requires — an absent guarantee
 * kept quiet would make people stop being wary where they should be.
 */
export interface AccessGuarantees {
  /** How far down authorisation goes. */
  readonly scope: "depot" | "chemin";
  /** Whether a commit's author is verified, or only declared by the client. */
  readonly authorVerified: boolean;
  /** Whether the author must have an account on the repo platform. */
  readonly accountRequired: boolean;
}

export const GUARANTEES: Record<AccessMode, AccessGuarantees> = {
  jeton_personnel: {
    scope: "depot",
    authorVerified: false,
    accountRequired: true,
  },
  identite_tierce: {
    scope: "depot",
    authorVerified: false,
    accountRequired: false,
  },
  relais: { scope: "chemin", authorVerified: true, accountRequired: false },
};

/**
 * What a project asks of the token that opens it, in the web version: the passkey offered to the author, or required of them (RG-protection-du-jeton-par-projet). Offered is the default: a project that sets nothing works as before.
 */
export type TokenProtection = "proposee" | "exigee";

/** The values a project can declare, to validate what is read. */
export const TOKEN_PROTECTIONS: ReadonlySet<TokenProtection> =
  new Set<TokenProtection>(["proposee", "exigee"]);

/** The modes a project can declare, to validate what is read. */
export const ACCESS_MODES: ReadonlySet<AccessMode> = new Set<AccessMode>([
  "jeton_personnel",
  "identite_tierce",
  "relais",
]);

export const ACCESS_MODE_LABEL: Record<AccessMode, string> = {
  jeton_personnel: "Jeton personnel",
  identite_tierce: "Identité tierce",
  relais: "Relais",
};

/**
 * Where the project has its authors' identity verified.
 *
 * Nothing secret here: the issuer and the client identifier are public by
 * nature, as in any application that runs in a browser. The
 * client has no secret — the one-time-secret exchange is what protects it.
 */
export interface IdentitySettings {
  /** Root of the identity server, up to and including the project's domain. */
  readonly issuer: string;
  /** Identifier of the public client declared with this issuer. */
  readonly client: string;
  /** Component that exchanges a verified identity for access to the repo. */
  readonly exchange: string;
}

/**
 * What a project sets for itself, in its configuration file.
 *
 * These settings live in the repo, not in the browser: they apply to
 * everyone working on the project, can be reviewed on the platform, and
 * follow the repo if it changes hands. A team setting that varied from one
 * machine to another would settle nothing.
 */
export interface ProjectSettings {
  /**
   * How authors obtain access to the repo.
   *
   * The personal token is the default: a project that declares nothing works,
   * and has nothing to host.
   */
  readonly access: AccessMode;
  /**
   * Parameters of the « identité tierce » mode. Absent in the other modes, and
   * also absent from a project that declares this mode without providing them — in which case
   * the application reports it rather than failing at sign-in.
   */
  readonly identity: IdentitySettings | null;
  /** Whether the token that opens this project must be kept under a passkey in the web version. */
  readonly tokenProtection: TokenProtection;
  /**
   * The external link kinds this project recognises.
   *
   * Declared in the repo: a project tracked on Trello and another on Jira
   * do not have the same resources to reference, and a hard-coded list in
   * the application would require changing it for each project.
   */
  readonly linkTags: readonly string[];
}

/** The complete content of a project repo, as loaded in memory. */
/**
 * A code repo this project builds.
 *
 * The link is declared here, on the side that has authority: the scoping repo carries the
 * « projet » view, which several code repos make up. Declaring it in
 * each code repo would duplicate it as many times as there are, and nothing would
 * guarantee that they stay in agreement.
 */
export interface CodeRepo {
  /** `organisation/repo`, as the platform names it. */
  readonly repo: string;
  /** What it carries, in a few words. Optional. */
  readonly role: string;
}

export interface Specification {
  readonly project: {
    readonly name: string;
    readonly description: string;
    readonly codeRepos: readonly CodeRepo[];
    /**
     * The prefix added to identifiers on display — RG-prefixe-projet.
     *
     * `null` when the project does not declare one, which is the default case:
     * its identifiers are then shown bare, as they are stored.
     */
    readonly prefix: string | null;
  };
  readonly settings: ProjectSettings;
  readonly domains: ReadonlyMap<string, Domain>;
  readonly features: ReadonlyMap<string, Feature>;
  readonly rules: ReadonlyMap<string, Rule>;
  /** What describes how the product is built — scoping 2026-038. */
  readonly decisions: ReadonlyMap<string, ArchitectureDecision>;
  readonly architecture: ReadonlyMap<string, ArchitectureDocument>;
  readonly scopings: ReadonlyMap<string, Scoping>;
  /** Anomalies met while loading, not blocking display. */
  readonly anomalies: readonly string[];
}

/** The statuses a scoping can carry, to validate what is declared. */
export const SCOPING_STATUSES: ReadonlySet<ScopingStatus> =
  new Set<ScopingStatus>(["brouillon", "en_relecture", "validee", "livree"]);

/**
 * The status toggles the application offers — RG-bascule-de-statut.
 *
 * Fixed, and not configurable: the status is read on the pull request, and
 * the application can only move it between draft and ready for review.
 * « Validée » is only obtained through a review; granting it to oneself would
 * empty it of its meaning. « Livrée » results from the merge, and nothing offers it.
 * An approved scoping can go back to draft: it is taken up again.
 */
export const STATUS_TOGGLES: ReadonlyMap<
  ScopingStatus,
  readonly ScopingStatus[]
> = new Map<ScopingStatus, readonly ScopingStatus[]>([
  ["brouillon", ["en_relecture"]],
  ["en_relecture", ["brouillon"]],
  ["validee", ["brouillon"]],
  // a delivered scoping is no longer taken up again: its impacts are propagated
  ["livree", []],
]);

// --- display labels ---

export const SCOPING_STATUS_LABEL: Record<ScopingStatus, string> = {
  brouillon: "Brouillon",
  en_relecture: "En relecture",
  validee: "Validée",
  livree: "Livrée",
};

/**
 * The statuses of a decision.
 *
 * `annulee` keeps the decision and its reason: erasing it would raise the
 * question again, without the reasoning that had closed it.
 */
export const DECISION_STATUSES: readonly DecisionStatus[] = [
  "ouverte",
  "retenue",
  "annulee",
];

export const DECISION_STATUS_LABEL: Record<DecisionStatus, string> = {
  ouverte: "Ouverte",
  retenue: "Retenue",
  annulee: "Annulée",
};

export const OPERATION_LABEL: Record<ImpactOperation, string> = {
  cree: "crée",
  modifie: "modifie",
  abroge: "abroge",
  touche: "touche",
};

/**
 * The link kinds of a project that declares none.
 *
 * The same as those of the example configuration file: a project
 * bootstrapped without touching it gets what it would have had by reading it.
 */
export const DEFAULT_LINK_TAGS: readonly string[] = [
  "carte_trello",
  "issue_github",
  "piste",
  "maquette",
  "document",
];

export const LINK_TAG_LABEL: Record<string, string> = {
  carte_trello: "Carte Trello",
  issue_github: "Issue GitHub",
  piste: "Piste",
  maquette: "Maquette",
  document: "Document",
};

/**
 * Lifecycle order: draft, in review, approved, delivered.
 *
 * It is the order of the scoping list, where what needs attention
 * comes before what is already a reference.
 */
export const LIFECYCLE_ORDER: Record<ScopingStatus, number> = {
  brouillon: 0,
  en_relecture: 1,
  validee: 2,
  livree: 3,
};

/**
 * Reverse order, to read a history backwards.
 *
 * On a rule's timeline, one starts from the current state — hence from the most
 * recent delivered scoping — to go back to its origin.
 */
export const HISTORY_ORDER: Record<ScopingStatus, number> = {
  livree: 0,
  validee: 1,
  en_relecture: 2,
  brouillon: 3,
};
