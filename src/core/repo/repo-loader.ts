import { inject } from "../injection";
import { load } from "js-yaml";
import {
  GithubClient,
  GithubError,
  RepoRef,
  TreeEntry,
} from "../github/github-client";
import { TokenService } from "../github/token.service";
import { ContentCache, KnownState } from "./content-cache";
import {
  splitFrontmatter,
  isUnreadable,
  extractSection,
  extractStatements,
  extractFreeSections,
  extractSubsections,
  KNOWN_SECTIONS,
} from "./frontmatter";
import {
  Scoping,
  Decision,
  CodeRepo,
  Domain,
  Feature,
  Impact,
  ExternalLink,
  ACCESS_MODES,
  AccessMode,
  Option,
  TOKEN_PROTECTIONS,
  TokenProtection,
  Attachment,
  Specification,
  IdentitySettings,
  ProjectSettings,
  Rule,
  ArchitectureDecision,
  ArchitectureDocument,
  DocumentKind,
  ScopingStatus,
  DecisionStatus,
  RuleStatus,
  DEFAULT_LINK_TAGS,
} from "../model/model";

/** Directories carrying entities. The rest (README…) is ignored. */
const DIRECTORIES = [
  "domains",
  "features",
  "rules",
  "cadrages",
  "decisions",
  "architecture",
] as const;

/**
 * The kinds an impact can target, in the order they are looked for.
 *
 * The same order as `CIBLES` in the shared verifier: both read the same
 * format, and a disagreement would be paid for by an impact understood
 * differently on each side.
 */
const TARGET_KINDS = ["regle", "adr", "architecture"] as const;

/** Configuration file, at the root of a framed repo. */
const CONFIG_NAME = "ssk-canon.yml";

interface LoadedFile {
  readonly path: string;
  readonly content: string;
}

/** A state the repo has not confirmed, for lack of having responded. */
export interface UnconfirmedState {
  /** Instant of the read that produced it, in ISO format. */
  readonly readAt: string;
  /** Why the repo did not respond, as the error says it. */
  readonly cause: string;
}

/** What a read returns, beyond the specification itself. */
export interface SpecificationRead {
  readonly specification: Specification;
  /** The fingerprints this read cited: what the cache must keep. */
  readonly fingerprints: ReadonlySet<string>;
  /** Present when the specification is the last one read, and not the current state. */
  readonly unconfirmed: UnconfirmedState | null;
}

export interface ReadOptions {
  readonly progression?: (loadedCount: number, total: number) => void;
  /**
   * Keep the tree read: to ask for it again conditionally, and to show it if
   * the repo no longer responds. A read at a past commit has no use for it.
   */
  readonly remember?: boolean;
  /**
   * Show the last state read if the repo does not respond (RG-dernier-etat-connu).
   * Reserved for consulting the specification: a read made in order to write
   * must fail rather than rely on an unconfirmed state.
   */
  readonly lastKnownState?: boolean;
}

/**
 * Loads a project repo and turns it into a model.
 *
 * The strategy: one request for the full tree, then only the contents the
 * machine does not hold, in parallel bounded by the limiter. The tree gives
 * each file's fingerprint; a content already stored under that fingerprint is
 * served again without a call, on either channel.
 * See `ContentCache` and RG-contenus-par-empreinte.
 */
export class RepoLoader {
  private readonly github = inject(GithubClient);
  private readonly tokens = inject(TokenService);
  private readonly cache = inject(ContentCache);

  async loadSpecification(
    repoRef: RepoRef,
    progression?: (loadedCount: number, total: number) => void,
  ): Promise<Specification> {
    return (await this.readSpecification(repoRef, { progression }))
      .specification;
  }

  async readSpecification(
    repoRef: RepoRef,
    options: ReadOptions = {},
  ): Promise<SpecificationRead> {
    const ref = repoRef.ref ?? "HEAD";
    const waiting =
      options.remember || options.lastKnownState
        ? this.cache.loadState(repoRef, ref)
        : Promise.resolve(null);
    // The known state is awaited before the tree only if it serves to request
    // it conditionally, hence with a token. Otherwise, the request leaves
    // without waiting for storage, and the state only serves afterwards.
    const conditional = options.remember === true && this.tokens.present();
    const knownBefore = conditional ? await waiting : null;

    let tree;
    try {
      tree = await this.github.loadTree(repoRef, knownBefore);
    } catch (e) {
      if (!(e instanceof GithubError) || !options.lastKnownState) throw e;
      const known = await waiting;

      // What the repo no longer shows to someone, the application does not show
      // them either — not even as last known state.
      if (isDenial(e)) {
        await this.cache.clearRepo(repoRef);
        throw e;
      }
      if (known && isUnreachable(e)) {
        const files = await this.readFromCache(repoRef, known.entries);
        if (files) {
          return {
            specification: this.buildSpecification(
              files,
              this.treeAnomalies(known.truncated),
            ),
            fingerprints: new Set(known.entries.map((x) => x.sha)),
            unconfirmed: { readAt: known.readAt, cause: e.message },
          };
        }
      }
      throw e;
    }

    const anomalies = this.treeAnomalies(tree.truncated);
    const relevant = tree.entries.filter(
      (e) =>
        e.type === "blob" &&
        e.path.endsWith(".md") &&
        this.isInKnownDirectory(e.path),
    );
    const config = tree.entries.find((e) => e.path === CONFIG_NAME);
    const toLoad: TreeEntry[] = config ? [config, ...relevant] : [...relevant];

    // Missing contents are read at the commit the tree has just resolved, not
    // by the branch name. `raw` serves with `max-age: 300`: a branch's URL
    // returns the old version for five minutes after a write, whereas a
    // commit's is fresh on every write. This is what makes a re-read
    // immediately faithful to what was just saved; the cache, stored by file
    // fingerprint, changes nothing to it, since a written file has a fresh
    // fingerprint.
    const pinned: RepoRef = { ...repoRef, ref: tree.sha };
    const known = await waiting;
    let isPrivate = known?.private ?? false;

    let done = 0;
    const files = await Promise.all(
      toLoad.map(async (e) => {
        let content = await this.cache.loadContent(repoRef, e.sha);
        if (content === null) {
          content = await this.github.loadContent(pinned, e.path, e.sha);
          // Read through the API: the public channel does not serve this repo, it is
          // private.
          isPrivate ||= this.github.contentsViaApi();
          await this.cache.saveContent(repoRef, e.sha, content, {
            private: isPrivate,
            persist: this.isPersistable(isPrivate),
          });
        }
        options.progression?.(++done, toLoad.length);
        return { path: e.path, content: content };
      }),
    );

    if (options.remember) {
      const state: KnownState = {
        commit: tree.sha,
        etag: tree.etag,
        readAt: new Date().toISOString(),
        entries: toLoad,
        truncated: tree.truncated,
        private: isPrivate,
      };
      await this.cache.saveState(repoRef, ref, state, {
        persist: this.isPersistable(isPrivate),
      });
    }

    return {
      specification: this.buildSpecification(files, anomalies),
      fingerprints: new Set(toLoad.map((e) => e.sha)),
      unconfirmed: null,
    };
  }

  /**
   * A private repo's contents do not outlive the access that read them: under
   * a temporary access, they stay in the tab, like it.
   * See RG-contenus-prives-au-repos.
   */
  private isPersistable(isPrivate: boolean): boolean {
    return !isPrivate || this.tokens.source() !== "identite_tierce";
  }

  /** The contents of a known tree, if they are all still held. */
  private async readFromCache(
    repoRef: RepoRef,
    entries: readonly TreeEntry[],
  ): Promise<LoadedFile[] | null> {
    const files: LoadedFile[] = [];
    for (const e of entries) {
      const content = await this.cache.loadContent(repoRef, e.sha);
      // A partial state would present itself as complete: failure is better.
      if (content === null) return null;
      files.push({ path: e.path, content });
    }
    return files;
  }

  private treeAnomalies(truncated: boolean): string[] {
    return truncated
      ? [
          "L’arborescence du dépôt a été tronquée par GitHub : le référentiel est incomplet.",
        ]
      : [];
  }

  private isInKnownDirectory(path: string): boolean {
    const first = path.split("/")[0];
    return (
      (DIRECTORIES as readonly string[]).includes(first) && path.includes("/")
    );
  }

  private buildSpecification(
    files: readonly LoadedFile[],
    anomalies: string[],
  ): Specification {
    const domains = new Map<string, Domain>();
    const features = new Map<string, Feature>();
    const rules = new Map<string, Rule>();
    const decisions = new Map<string, ArchitectureDecision>();
    const architecture = new Map<string, ArchitectureDocument>();
    const rawScopings = new Map<
      string,
      { data: Record<string, unknown>; body: string }
    >();
    const decisionsByScoping = new Map<string, Decision[]>();
    const attachmentsByScoping = new Map<string, Attachment[]>();

    let project = {
      name: "Projet",
      description: "",
      codeRepos: [] as readonly CodeRepo[],
      prefix: null as string | null,
    };
    let settings: ProjectSettings = {
      access: "jeton_personnel",
      identity: null,
      tokenProtection: "proposee",
      linkTags: DEFAULT_LINK_TAGS,
    };

    for (const f of files) {
      if (f.path === CONFIG_NAME) {
        const config = this.parseConfig(f.content, project);
        project = config.project;
        settings = config.settings;
        anomalies.push(...config.anomalies);
        continue;
      }

      // A README in a content directory is not an entity: it explains what the
      // directory expects, to whoever opens the repo on the platform. Reporting
      // it as malformed would clutter the load of perfectly valid documentation.
      if (f.path.endsWith("/README.md")) continue;

      const parse = splitFrontmatter(f.content);
      if (!parse) {
        anomalies.push(`${f.path} : frontmatter absent.`);
        continue;
      }
      // An unreadable file is set aside and reported, without interrupting the
      // others: a specification missing one entity stays readable, whereas an
      // interrupted load shows nothing at all.
      if (isUnreadable(parse)) {
        anomalies.push(`${f.path} : ${parse.error}.`);
        continue;
      }

      const { data, body } = parse;
      const segments = f.path.split("/");

      switch (segments[0]) {
        case "domains":
          domains.set(str(data["id"]), {
            id: str(data["id"]),
            name: str(data["nom"]) || str(data["id"]),
            description: body.trim(),
          });
          break;

        case "features":
          features.set(str(data["id"]), {
            id: str(data["id"]),
            name: str(data["nom"]) || str(data["id"]),
            domains: toList(data["domaines"]),
            description: body.trim(),
          });
          break;

        case "rules":
          rules.set(str(data["id"]), {
            id: str(data["id"]),
            status: (str(data["statut"]) || "actif") as RuleStatus,
            features: toList(data["fonctionnalites"]),
            statement: body.trim(),
            createdBy: data["cree_par"] ? str(data["cree_par"]) : null,
            modifiedBy: toList(data["modifie_par"]),
          });
          break;

        case "decisions":
          decisions.set(str(data["id"]), {
            id: str(data["id"]),
            status: (str(data["statut"]) || "actif") as RuleStatus,
            statement: body.trim(),
            createdBy: data["cree_par"] ? str(data["cree_par"]) : null,
            modifiedBy: toList(data["modifie_par"]),
          });
          break;

        case "architecture":
          architecture.set(str(data["id"]), {
            id: str(data["id"]),
            // A document without a declared kind is a component: it is the kind with
            // nothing to link, hence the only one that can be guessed without risk of
            // being wrong about what the document describes.
            kind: (str(data["nature"]) || "composant") as DocumentKind,
            status: (str(data["statut"]) || "actif") as RuleStatus,
            components: toList(data["composants"]),
            statement: body.trim(),
            createdBy: data["cree_par"] ? str(data["cree_par"]) : null,
            modifiedBy: toList(data["modifie_par"]),
          });
          break;

        case "cadrages": {
          const scopingId = segments[1];
          if (segments[2] === "cadrage.md") {
            // The Action's verifier refuses a declared status. Reporting it here
            // shows from the application what would otherwise only be discovered in
            // continuous integration, once the pull request is open.
            if (data["statut"] !== undefined) {
              anomalies.push(
                `${f.path} : le statut ne se déclare pas, il se déduit de l’état du dépôt.`,
              );
            }
            rawScopings.set(scopingId, { data, body: body });
          } else if (segments[2] === "decisions") {
            const decisions = decisionsByScoping.get(scopingId) ?? [];
            decisions.push(this.parseDecision(data, body));
            decisionsByScoping.set(scopingId, decisions);
          } else if (segments[2] === "attachments.md") {
            attachmentsByScoping.set(scopingId, this.parseAttachments(data));
          }
          break;
        }
      }
    }

    const scopings = new Map<string, Scoping>();
    for (const [id, { data, body }] of rawScopings) {
      scopings.set(id, {
        id: str(data["id"]) || id,
        title: str(data["titre"]) || id,
        // No status here: it is derived from the repo's state, not from the file.
        // The loader reads a ref without knowing which one; it is the store, which
        // knows where each scoping comes from, that decides. « livree » is thus
        // the status of what is read, and the provenance corrects it if needed.
        status: "livree" as ScopingStatus,
        domains: toList(data["domaines"]),
        links: this.parseLinks(data["liens"]),
        impacts: this.parseImpacts(data["impacts"]),
        goal: extractSection(body, "Objectif"),
        journey: extractSection(body, "Parcours utilisateur"),
        statements: extractStatements(body),
        decisions: (decisionsByScoping.get(id) ?? []).sort((a, b) =>
          a.id.localeCompare(b.id),
        ),
        attachments: attachmentsByScoping.get(id) ?? [],
        misc: extractFreeSections(body, KNOWN_SECTIONS),
      });
    }

    return {
      project: project,
      settings,
      domains,
      features,
      rules,
      decisions,
      architecture,
      scopings,
      anomalies,
    };
  }

  /**
   * Reads the project's configuration file.
   *
   * An absent, unreadable or incomplete file blocks nothing: the project keeps
   * the default settings, and the anomaly is reported. A specification can be
   * consulted even without a valid configuration.
   */
  private parseConfig(
    content: string,
    defaultProject: {
      name: string;
      description: string;
      codeRepos: readonly CodeRepo[];
      prefix: string | null;
    },
  ) {
    const defaults = {
      project: defaultProject,
      settings: {
        access: "jeton_personnel" as AccessMode,
        identity: null,
        tokenProtection: "proposee" as TokenProtection,
        linkTags: DEFAULT_LINK_TAGS,
      },
      anomalies: [] as string[],
    };

    let data: Record<string, unknown> | undefined;
    try {
      // the file has no frontmatter: it is bare YAML
      data = load(content) as Record<string, unknown> | undefined;
    } catch (e) {
      return {
        ...defaults,
        anomalies: [
          `${CONFIG_NAME} : illisible — ${(e as Error).message.split("\n")[0]}.`,
        ],
      };
    }

    const rawProject = (data?.["projet"] ?? {}) as Record<string, unknown>;
    // `transitions` and `reflet_demande_fusion` are no longer read: the cycle
    // is no longer configurable (2026-045). A project that still declares them
    // sees them ignored without anomaly — they are settings that became
    // pointless, not wrong settings.
    const anomalies: string[] = [];
    const readRepos = parseCodeRepos(data?.["depots_code"]);
    anomalies.push(...readRepos.anomalies);
    const { access, anomaly } = parseAccessMode(data?.["acces"]);
    if (anomaly) anomalies.push(anomaly);

    const readProtection = parseTokenProtection(data?.["protection_du_jeton"]);
    if (readProtection.anomaly) anomalies.push(readProtection.anomaly);

    const readIdentity = parseIdentity(data?.["identite"]);
    anomalies.push(...readIdentity.anomalies);
    if (access === "identite_tierce" && !readIdentity.identity) {
      anomalies.push(
        `${CONFIG_NAME} : le mode « identite_tierce » demande un bloc « identite » ` +
          "complet — émetteur, client et échange.",
      );
    }

    return {
      project: {
        name: str(rawProject["nom"]) || defaultProject.name,
        description:
          str(rawProject["description"]) || defaultProject.description,
        codeRepos: readRepos.repos,
        prefix: str(rawProject["prefixe"]) || null,
      },
      settings: {
        access: access,
        identity: readIdentity.identity,
        tokenProtection: readProtection.protection,
        linkTags: parseLinkTags(data?.["tags_liens"]),
      },
      anomalies,
    };
  }

  private parseDecision(data: Record<string, unknown>, body: string): Decision {
    const chosen = data["option_retenue"] ? str(data["option_retenue"]) : null;
    const subsections = extractSubsections(body, "Options");

    const options: Option[] = [...subsections].map(([title, text]) => ({
      id: title,
      title: title,
      chosen: chosen !== null && title === chosen,
      body: text,
    }));

    return {
      id: str(data["id"]),
      title: str(data["titre"]) || str(data["id"]),
      status: (str(data["statut"]) || "ouverte") as DecisionStatus,
      chosenOption: chosen,
      description: extractSection(body, "Description"),
      options,
      body,
    };
  }

  private parseLinks(raw: unknown): ExternalLink[] {
    if (!Array.isArray(raw)) return [];
    return raw
      .filter((l): l is Record<string, unknown> => !!l && typeof l === "object")
      .map((l) => ({
        tag: str(l["tag"]),
        url: str(l["url"]),
        name: str(l["nom"]),
      }))
      .filter((l) => l.url);
  }

  private parseImpacts(raw: unknown): Impact[] {
    if (!Array.isArray(raw)) return [];
    return raw
      .filter((i): i is Record<string, unknown> => !!i && typeof i === "object")
      .map((i) => {
        // The order follows that of CIBLES in the shared verifier: an impact
        // declares only one target, and the first one found is the one that counts.
        const kind = TARGET_KINDS.find((n) => i[n] !== undefined) ?? "regle";
        const target = str(i[kind]);
        // `rule` stays filled for callers that still read it; it carries only
        // impacts of that kind, never an architecture identifier they would then
        // treat as a rule.
        return {
          target: target,
          kind: kind,
          operation: str(i["operation"]) as Impact["operation"],
          rule: kind === "regle" ? target : "",
        };
      })
      .filter((i) => i.target);
  }

  private parseAttachments(data: Record<string, unknown>): Attachment[] {
    const raw = data["attachments"];
    if (!Array.isArray(raw)) return [];
    return raw
      .filter((a): a is Record<string, unknown> => !!a && typeof a === "object")
      .map((a) => ({
        name: str(a["nom"]),
        sha256: str(a["sha256"]),
        size: Number(a["taille"]) || 0,
        type: str(a["type"]),
        addedAt: a["ajoute_le"] ? str(a["ajoute_le"]) : null,
      }));
  }
}

function str(v: unknown): string {
  return v === null || v === undefined ? "" : String(v);
}

function toList(v: unknown): string[] {
  if (Array.isArray(v)) return v.map(str).filter(Boolean);
  return [];
}

/**
 * Code repos this project implements.
 *
 * A malformed repo is set aside and reported, without failing the read: the
 * list serves to find one's bearings, and a doubtful entry must not make the
 * specification unreadable.
 */
export function parseCodeRepos(raw: unknown): {
  repos: readonly CodeRepo[];
  anomalies: string[];
} {
  if (raw === undefined || raw === null) return { repos: [], anomalies: [] };
  if (!Array.isArray(raw)) {
    return {
      repos: [],
      anomalies: [`${CONFIG_NAME} : « depots_code » doit être une liste.`],
    };
  }

  const repos: CodeRepo[] = [];
  const anomalies: string[] = [];
  for (const entry of raw) {
    // The short form — just the repo name — is allowed: the role tells nothing
    // when the project has only one.
    const repo =
      typeof entry === "string"
        ? entry
        : str((entry as Record<string, unknown>)?.["repo"]);
    const role =
      typeof entry === "string"
        ? ""
        : str((entry as Record<string, unknown>)?.["role"]);

    if (!/^[^/\s]+\/[^/\s]+$/.test(repo)) {
      anomalies.push(
        `${CONFIG_NAME} : dépôt de code « ${repo || "(vide)"} » ignoré — ` +
          "attendu « organisation/depot ».",
      );
      continue;
    }
    repos.push({ repo, role });
  }
  return { repos, anomalies };
}

/**
 * The link kinds declared by the project.
 *
 * An absent or empty list returns the default one: a project that has not
 * expressed a choice must be able to reference something, otherwise entering
 * a link would offer no choice.
 */
export function parseLinkTags(raw: unknown): readonly string[] {
  if (!Array.isArray(raw)) return DEFAULT_LINK_TAGS;
  const tags = raw.map((t) => str(t).trim()).filter(Boolean);
  return tags.length ? tags : DEFAULT_LINK_TAGS;
}

/**
 * Access mode declared by the project, or the default mode.
 *
 * An unknown mode is set aside and reported: putting up with it silently would
 * let the project believe it applies a setting it does not apply. The personal
 * token serves as fallback — it is the only mode that requires hosting nothing.
 *
 * A free function rather than a method: it depends on no injection, and
 * testing it must not require building a loader.
 */
export function parseAccessMode(raw: unknown): {
  access: AccessMode;
  anomaly: string | null;
} {
  if (raw === undefined || raw === null)
    return { access: "jeton_personnel", anomaly: null };

  const value = str(raw);
  if (ACCESS_MODES.has(value as AccessMode)) {
    return { access: value as AccessMode, anomaly: null };
  }
  return {
    access: "jeton_personnel",
    anomaly:
      `${CONFIG_NAME} : mode d'accès inconnu « ${value} » — ` +
      `attendu ${[...ACCESS_MODES].join(", ")}. Le jeton personnel s'applique.`,
  };
}

/**
 * What the project requires of the token that opens it, or the default proposal.
 *
 * An unknown value is set aside and reported, like an unknown access mode: putting up with it would let the project believe it requires a protection it does not require (RG-protection-du-jeton-par-projet).
 */
export function parseTokenProtection(raw: unknown): {
  protection: TokenProtection;
  anomaly: string | null;
} {
  if (raw === undefined || raw === null)
    return { protection: "proposee", anomaly: null };

  const value = str(raw);
  if (TOKEN_PROTECTIONS.has(value as TokenProtection)) {
    return { protection: value as TokenProtection, anomaly: null };
  }
  return {
    protection: "proposee",
    anomaly:
      `${CONFIG_NAME} : protection du jeton inconnue « ${value} » — ` +
      `attendu ${[...TOKEN_PROTECTIONS].join(", ")}. La passkey est proposée, non exigée.`,
  };
}

/** Fields expected in an `identite` block, and what they designate. */
const IDENTITY_FIELDS = ["emetteur", "client", "echange"] as const;

/**
 * Parameters of the « identité tierce » mode, if declared and complete.
 *
 * An incomplete block returns `null` rather than an object with holes: sign-in
 * would fail anyway, and failing at load at least leaves the specification
 * readable and the anomaly visible.
 *
 * A free function rather than a method: it depends on no injection, and
 * testing it must not require building a loader.
 */
export function parseIdentity(raw: unknown): {
  identity: IdentitySettings | null;
  anomalies: string[];
} {
  if (!raw || typeof raw !== "object") return { identity: null, anomalies: [] };

  const data = raw as Record<string, unknown>;
  const anomalies: string[] = [];
  const values: Record<string, string> = {};

  for (const field of IDENTITY_FIELDS) {
    const value = str(data[field]).trim();
    if (!value) {
      anomalies.push(`${CONFIG_NAME} : identite.${field} manquant.`);
      continue;
    }
    // A malformed address would otherwise be discovered at sign-in time, far
    // from its cause.
    if (field !== "client") {
      try {
        new URL(value);
      } catch {
        anomalies.push(
          `${CONFIG_NAME} : identite.${field} n'est pas une adresse valide.`,
        );
        continue;
      }
    }
    values[field] = value;
  }

  if (anomalies.length) return { identity: null, anomalies };
  return {
    identity: {
      // a trailing slash would double the separators of built addresses
      issuer: values["emetteur"].replace(/\/+$/, ""),
      client: values["client"],
      exchange: values["echange"].replace(/\/+$/, ""),
    },
    anomalies: [],
  };
}

/**
 * The platform refuses access: token refused, missing right, repo out of
 * scope. A reached limit is not one — it lifts by itself.
 */
function isDenial(e: GithubError): boolean {
  return (
    e.status === 401 ||
    e.status === 404 ||
    (e.status === 403 && !e.quotaExhausted)
  );
}

/** The repo does not respond, without saying anything about access: network, limit, outage. */
function isUnreachable(e: GithubError): boolean {
  return e.status === 0 || e.quotaExhausted || e.status >= 500;
}
