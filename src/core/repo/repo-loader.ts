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

/** Répertoires portant des entités. Le reste (README…) est ignoré. */
const DIRECTORIES = [
  "domains",
  "features",
  "rules",
  "cadrages",
  "decisions",
  "architecture",
] as const;

/**
 * Les natures qu'un impact peut viser, dans l'ordre où on les cherche.
 *
 * Le même ordre que `CIBLES` du vérificateur partagé : les deux lisent le même
 * format, et un désaccord se paierait par un impact compris différemment de
 * chaque côté.
 */
const TARGET_KINDS = ["regle", "adr", "architecture"] as const;

/** Fichier de configuration, à la racine d'un dépôt cadré. */
const CONFIG_NAME = "ssk-canon.yml";

interface LoadedFile {
  readonly path: string;
  readonly content: string;
}

/** Un état que le dépôt n'a pas confirmé, faute d'avoir répondu. */
export interface UnconfirmedState {
  /** Instant de la lecture qui l'a produit, au format ISO. */
  readonly readAt: string;
  /** Pourquoi le dépôt n'a pas répondu, tel que l'erreur le dit. */
  readonly cause: string;
}

/** Ce qu'une lecture rend, au-delà du référentiel lui-même. */
export interface SpecificationRead {
  readonly specification: Specification;
  /** Les empreintes que cette lecture a citées : ce que le cache doit garder. */
  readonly fingerprints: ReadonlySet<string>;
  /** Présent quand le référentiel est le dernier lu, et non l'état courant. */
  readonly unconfirmed: UnconfirmedState | null;
}

export interface ReadOptions {
  readonly progression?: (loadedCount: number, total: number) => void;
  /**
   * Garder l'arborescence lue : pour la redemander sous condition, et pour la
   * montrer si le dépôt ne répond plus. Une lecture à un commit passé n'en a
   * pas l'usage.
   */
  readonly remember?: boolean;
  /**
   * Montrer le dernier état lu si le dépôt ne répond pas (RG-dernier-etat-connu).
   * Réservé à la consultation du référentiel : une lecture faite pour écrire
   * doit échouer plutôt que de se fonder sur un état non confirmé.
   */
  readonly lastKnownState?: boolean;
}

/**
 * Charge un dépôt de projet et le transforme en modèle.
 *
 * La stratégie : une requête pour l'arborescence complète, puis les seuls
 * contenus que le poste ne détient pas, en parallèle borné par le limiteur.
 * L'arborescence donne l'empreinte de chaque fichier ; un contenu déjà rangé
 * sous cette empreinte est resservi sans appel, sur l'un ou l'autre canal.
 * Voir `ContenusCache` et RG-contenus-par-empreinte.
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
    // L'état connu n'est attendu avant l'arborescence que s'il sert à la
    // demander sous condition, donc avec un jeton. Sinon, la demande part sans
    // attendre le stockage, et l'état ne sert qu'après.
    const conditional = options.remember === true && this.tokens.present();
    const knownBefore = conditional ? await waiting : null;

    let tree;
    try {
      tree = await this.github.loadTree(repoRef, knownBefore);
    } catch (e) {
      if (!(e instanceof GithubError) || !options.lastKnownState) throw e;
      const known = await waiting;

      // Ce que le dépôt ne montre plus à quelqu'un, l'application ne le lui
      // montre pas davantage — pas même comme dernier état connu.
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

    // Les contenus manquants sont lus au commit que l'arborescence vient de
    // résoudre, non au nom de la branche. `raw` sert avec `max-age: 300` :
    // l'URL d'une branche rend l'ancienne version pendant cinq minutes après
    // une écriture, alors que celle d'un commit est neuve à chaque écriture.
    // C'est ce qui rend une relecture immédiatement fidèle à ce qu'on vient
    // d'enregistrer ; le cache, rangé par empreinte de fichier, n'y change
    // rien, puisqu'un fichier écrit a une empreinte neuve.
    const pinned: RepoRef = { ...repoRef, ref: tree.sha };
    const known = await waiting;
    let isPrivate = known?.private ?? false;

    let done = 0;
    const files = await Promise.all(
      toLoad.map(async (e) => {
        let content = await this.cache.loadContent(repoRef, e.sha);
        if (content === null) {
          content = await this.github.loadContent(pinned, e.path, e.sha);
          // Lu par l'API : le canal public ne dessert pas ce dépôt, il est privé.
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
   * Les contenus d'un dépôt privé ne survivent pas à l'accès qui les a lus :
   * sous un accès temporaire, ils restent dans l'onglet, comme lui.
   * Voir RG-contenus-prives-au-repos.
   */
  private isPersistable(isPrivate: boolean): boolean {
    return !isPrivate || this.tokens.source() !== "identite_tierce";
  }

  /** Les contenus d'une arborescence connue, s'ils sont tous encore détenus. */
  private async readFromCache(
    repoRef: RepoRef,
    entries: readonly TreeEntry[],
  ): Promise<LoadedFile[] | null> {
    const files: LoadedFile[] = [];
    for (const e of entries) {
      const content = await this.cache.loadContent(repoRef, e.sha);
      // Un état partiel se présenterait comme complet : mieux vaut l'échec.
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

      // Un README dans un répertoire de contenu n'est pas une entité : il
      // explique ce que le répertoire attend, à qui ouvre le dépôt sur la
      // plateforme. Le signaler comme mal formé encombrerait le chargement de
      // documentation parfaitement valide.
      if (f.path.endsWith("/README.md")) continue;

      const parse = splitFrontmatter(f.content);
      if (!parse) {
        anomalies.push(`${f.path} : frontmatter absent.`);
        continue;
      }
      // Un fichier illisible est écarté et signalé, sans interrompre les
      // autres : un référentiel amputé d'une entité reste consultable, alors
      // qu'un chargement interrompu ne montre rien du tout.
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
            // Un document sans nature déclarée est un composant : c'est la
            // nature qui n'a rien à relier, donc la seule qui se devine sans
            // risque de se tromper sur ce que le document décrit.
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
            // Le vérificateur de l'Action refuse un statut déclaré. Le signaler
            // ici fait voir depuis l'application ce qui, sinon, ne se découvre
            // qu'en intégration continue, une fois la demande ouverte.
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
        // Pas de statut ici : il se déduit de l'état du dépôt, non du fichier.
        // Le chargeur lit une référence sans savoir laquelle ; c'est le store,
        // qui sait d'où vient chaque cadrage, qui tranche. « livree » est donc
        // le statut de ce qu'on lit, et la provenance le corrige si besoin.
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
   * Lit le fichier de configuration du projet.
   *
   * Un fichier absent, illisible ou incomplet ne bloque rien : le projet garde
   * les réglages par défaut, et l'anomalie est signalée. Un référentiel se
   * consulte même sans configuration valide.
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
      // le fichier n'a pas de frontmatter : c'est du YAML nu
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
    // `transitions` et `reflet_demande_fusion` ne se lisent plus : le cycle
    // n'est plus réglable (2026-045). Un projet qui les déclare encore les voit
    // ignorés sans anomalie — ce sont des réglages devenus sans objet, non des
    // réglages faux.
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
        // L'ordre suit celui de CIBLES dans le vérificateur partagé : un impact
        // ne déclare qu'une cible, et c'est la première trouvée qui vaut.
        const kind = TARGET_KINDS.find((n) => i[n] !== undefined) ?? "regle";
        const target = str(i[kind]);
        // `regle` reste renseigné pour les appelants qui le lisent encore ; il
        // ne porte que les impacts de cette nature, jamais un identifiant
        // d'architecture qu'ils traiteraient alors comme une règle.
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
 * Dépôts de code que ce projet réalise.
 *
 * Un dépôt mal formé est écarté et signalé, sans faire échouer la lecture : la
 * liste sert à se situer, et une entrée douteuse ne doit pas rendre le
 * référentiel illisible.
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
    // La forme courte — juste le nom du dépôt — est admise : le rôle n'apprend
    // rien quand le projet n'en compte qu'un.
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
 * Les natures de lien déclarées par le projet.
 *
 * Une liste absente ou vide rend celle par défaut : un projet qui ne s'est pas
 * prononcé doit pouvoir référencer quelque chose, sinon la saisie d'un lien
 * n'offrirait aucun choix.
 */
export function parseLinkTags(raw: unknown): readonly string[] {
  if (!Array.isArray(raw)) return DEFAULT_LINK_TAGS;
  const tags = raw.map((t) => str(t).trim()).filter(Boolean);
  return tags.length ? tags : DEFAULT_LINK_TAGS;
}

/**
 * Mode d'accès déclaré par le projet, ou le mode par défaut.
 *
 * Un mode inconnu est écarté et signalé : le subir silencieusement laisserait
 * croire au projet qu'il applique un réglage qu'il n'applique pas. Le jeton
 * personnel sert de recours — c'est le seul mode qui ne demande rien à héberger.
 *
 * Fonction libre plutôt que méthode : elle ne dépend d'aucune injection, et
 * l'éprouver ne doit pas demander de construire un chargeur.
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
 * Ce que le projet demande du jeton qui l'ouvre, ou la proposition par défaut.
 *
 * Une valeur inconnue est écartée et signalée, comme un mode d'accès inconnu : la subir laisserait croire au projet qu'il exige une protection qu'il n'exige pas (RG-protection-du-jeton-par-projet).
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

/** Champs attendus d'un bloc `identite`, et ce qu'ils désignent. */
const IDENTITY_FIELDS = ["emetteur", "client", "echange"] as const;

/**
 * Paramètres du mode « identité tierce », s'ils sont déclarés et complets.
 *
 * Un bloc incomplet rend `null` plutôt qu'un objet à trous : la connexion
 * échouerait de toute façon, et échouer au chargement laisse au moins le
 * référentiel lisible et l'anomalie visible.
 *
 * Fonction libre plutôt que méthode : elle ne dépend d'aucune injection, et
 * l'éprouver ne doit pas demander de construire un chargeur.
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
    // Une adresse mal formée se découvrirait sinon au moment de la connexion,
    // loin de sa cause.
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
      // une barre finale doublerait les séparateurs des adresses construites
      issuer: values["emetteur"].replace(/\/+$/, ""),
      client: values["client"],
      exchange: values["echange"].replace(/\/+$/, ""),
    },
    anomalies: [],
  };
}

/**
 * La plateforme refuse l'accès : jeton refusé, droit manquant, dépôt hors de
 * portée. Une limite atteinte n'en est pas un — elle se lève d'elle-même.
 */
function isDenial(e: GithubError): boolean {
  return (
    e.status === 401 ||
    e.status === 404 ||
    (e.status === 403 && !e.quotaExhausted)
  );
}

/** Le dépôt ne répond pas, sans rien dire de l'accès : réseau, limite, panne. */
function isUnreachable(e: GithubError): boolean {
  return e.status === 0 || e.quotaExhausted || e.status >= 500;
}
