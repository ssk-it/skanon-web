import { inject } from "../injection";
import { computed, signal } from "../signals";
import { PLATFORM } from "../../platform/platform-token";
import type {
  VaultWrite,
  SealingState,
  SealingOutcome,
  StoredTokens,
} from "../../platform/ports";
import type { TokenProtection } from "../model/model";
import { ContentCache } from "../repo/content-cache";

/**
 * La clé de l'ancien coffre chiffré, effacée au démarrage.
 *
 * Son contenu n'est pas récupérable : il était scellé sous une passphrase que
 * plus rien ne demande. Le garder n'entretiendrait que l'illusion qu'il l'est.
 */
const LEGACY_VAULT_KEY = "ssk-canon.coffre";
const LEGACY_SESSION_KEY = "ssk-canon.cle-session";

/**
 * À quoi un jeton s'applique.
 *
 * Deux niveaux, parce que la plateforme en emploie deux : l'organisation est la
 * frontière où se décident l'approbation et les politiques, et c'est donc le
 * cas courant ; un dépôt peut néanmoins demander le sien — un accès en écriture
 * là où le reste de l'organisation est en lecture.
 */
export interface ScopedToken {
  /** `organisation` ou `organisation/depot`. */
  readonly key: string;
  readonly token: string;
}

/** La clé d'organisation d'un dépôt, et la clé exacte du dépôt. */
export function repoKeys(repoRef: { owner: string; repo: string }): {
  organization: string;
  exact: string;
} {
  const org = repoRef.owner.toLowerCase();
  return { organization: org, exact: `${org}/${repoRef.repo.toLowerCase()}` };
}

/** Un accès obtenu contre une identité vérifiée, et ce qu'il ouvre. */
export interface TemporaryAccess {
  readonly token: string;
  /** Instant au-delà duquel il ne doit plus être présenté. */
  readonly validUntil: string;
  readonly repos: readonly string[];
  readonly identity: {
    readonly identifier: string;
    readonly name: string;
    readonly email: string | null;
  };
}

/** D'où vient le jeton courant. */
export type TokenSource = "aucune" | "personnel" | "identite_tierce";

/**
 * Sous quelle forme les jetons sont gardés sur le poste, pour que l'interface le dise (RG-secret-conserve-localement) : dans le coffre du système (bureau), en clair dans le navigateur, scellés par une passkey, ou pour l'onglet seulement — un projet de l'onglet exige la passkey, et ils ne le sont pas (RG-protection-du-jeton-par-projet).
 */
export type TokenForm = "systeme" | "en-clair" | "scelle" | "session";

/** Ce qu'a donné la dernière sollicitation de la passkey, quand elle n'a pas abouti. */
export type PasskeyFailure = "annule" | "impossible" | "illisible";

/**
 * Le jeton d'accès à GitHub.
 *
 * Point de substitution unique pour la phase 7 : le proxy remplacera la saisie
 * manuelle en fournissant un jeton d'installation, et rien d'autre ne changera
 * dans l'application — `GithubClient` interroge ce service, pas le stockage.
 *
 * Les jetons sont gardés dans le coffre de la cible — voir `plateforme/ports.ts`
 * pour ce que cela vaut. D'où le conseil, qui prime ici : n'accorder qu'un
 * jeton de moindre privilège, et le révoquer sur GitHub le jour où il n'a plus
 * lieu d'être.
 */
export class TokenService {
  /**
   * Les contenus privés lus sous un accès ne lui survivent pas : oublier un
   * jeton efface ce qu'il avait ouvert. Voir RG-contenus-prives-au-repos.
   */
  private readonly cache = inject(ContentCache);

  /**
   * Le coffre de la cible : celui du système dans l'application de bureau, le stockage local dans la version web (INV-8). Ses écritures ne sont pas attendues : chaque appel part dans l'ordre où l'état change, et un coffre indisponible laisse les jetons valoir pour la session.
   */
  private readonly vault = inject(PLATFORM).vault;

  /** Le scellement par passkey de la version web ; `null` sur le bureau, dont le coffre du système suffit. */
  private readonly sealing = inject(PLATFORM).sealing;

  /** L'état du scellé, relevé après chaque geste : le coffre le tient, mais ne le signale pas. */
  private readonly sealingState = signal<SealingState>("aucun");

  /**
   * Vrai dès qu'un projet ouvert dans cet onglet exige la passkey, et jusqu'à sa fermeture : un jeton peut ouvrir plusieurs projets, et il est gardé selon le plus exigeant d'entre eux (RG-protection-du-jeton-par-projet).
   */
  private readonly required = signal(false);

  /** Vrai quand des jetons scellés attendent un geste de l'utilisateur pour s'ouvrir. */
  readonly locked = computed(() => this.sealingState() === "verrouille");

  readonly form = computed<TokenForm>(() => {
    if (!this.sealing) return "systeme";
    if (this.sealingState() !== "aucun") return "scelle";
    return this.required() ? "session" : "en-clair";
  });

  /** Vrai quand un projet de l'onglet exige la passkey, pour le dire. */
  readonly protectionRequired = computed(() => this.required());

  /** Ce qu'a donné la dernière sollicitation de la passkey, pour le dire ; `null` après un succès. */
  readonly passkeyFailure = signal<PasskeyFailure | null>(null);

  /**
   * Ce que le coffre a refusé à la dernière écriture : garder les jetons (`ecriture`) — ils valent pour la session et ne seront pas retrouvés au lancement suivant —, ou les effacer (`effacement`) — ils y seront retrouvés. `null` quand il a accepté. RG-secret-conserve-localement : l'interface le dit.
   */
  readonly vaultRefused = signal<"ecriture" | "effacement" | null>(null);

  private readonly token = signal<string | null>(null);

  /**
   * Les jetons par portée, du plus général au plus précis.
   *
   * Un rédacteur travaille sur des projets appartenant à plusieurs
   * organisations, et un jeton peut ne couvrir que l'une d'elles — restreint à
   * une sélection de dépôts, soumis à l'approbation de l'organisation, expirant
   * à sa propre date. N'en garder qu'un revenait à écraser le précédent sans
   * rien dire, puis à présenter « dépôt introuvable » sur un dépôt bien réel.
   */
  private readonly byScope = signal<ReadonlyMap<string, string>>(new Map());

  /**
   * Le dépôt pour lequel le jeton est choisi.
   *
   * Fourni de l'extérieur plutôt que lu : ce service est interrogé par la
   * couche d'accès, et dépendre en retour de la configuration du dépôt ferait
   * un cycle.
   */
  private readonly currentRepo = signal<{
    owner: string;
    repo: string;
  } | null>(null);

  /** Dit pour quel dépôt les jetons doivent être choisis. */
  targetRepo(repoRef: { owner: string; repo: string } | null): void {
    this.currentRepo.set(repoRef);
  }

  /** La cible courante, pour la rétablir après l'avoir déplacée. */
  currentTarget(): { owner: string; repo: string } | null {
    return this.currentRepo();
  }

  /** Les portées déclarées, pour les présenter et les modifier. */
  readonly scopes = computed(() =>
    [...this.byScope().entries()]
      .map(([key, token]) => ({ key: key, token: token }))
      .sort((a, b) => a.key.localeCompare(b.key)),
  );

  /**
   * Le jeton qui s'applique au dépôt courant.
   *
   * Le plus précis l'emporte : un jeton déclaré pour `org/depot` prime sur celui
   * de `org`, qui prime sur le jeton général. Sans cette gradation, déclarer un
   * accès particulier à un dépôt obligerait à le redéclarer pour tous les
   * autres de l'organisation.
   */
  private applicableToken(
    d: { owner: string; repo: string } | null = this.currentRepo(),
  ): string | null {
    if (d) {
      const { organization, exact } = repoKeys(d);
      const byScope = this.byScope();
      const specific = byScope.get(exact) ?? byScope.get(organization);
      if (specific) return specific;
    }
    return this.token();
  }

  /**
   * Accès obtenu contre une identité vérifiée.
   *
   * Il ne va pas dans le stockage du navigateur : il expire en une heure, et le
   * retrouver le lendemain ne produirait que des erreurs d'autorisation dont la
   * cause serait invisible. Le perdre en rechargeant est le comportement juste —
   * une nouvelle identité vérifiée le rend aussitôt.
   */
  private readonly access = signal<TemporaryAccess | null>(null);

  /** Vrai si un jeton est disponible, quelle qu'en soit la source. */
  readonly present = computed(() => this.value() !== null);

  /**
   * Vrai si rien n'est enregistré : ni jeton général, ni jeton d'une portée, ni accès temporaire.
   *
   * `present` ne répond que pour le dépôt ciblé : un jeton enregistré pour une autre organisation y compte pour rien, alors qu'il est bien en place (RG-acces-par-portee).
   */
  readonly noAccess = computed(
    () =>
      this.token() === null &&
      this.byScope().size === 0 &&
      this.access() === null,
  );

  readonly source = computed<TokenSource>(() => {
    if (this.access() !== null) return "identite_tierce";
    return this.applicableToken() === null ? "aucune" : "personnel";
  });

  /** Qui a obtenu l'accès courant, s'il vient d'une identité vérifiée. */
  readonly identity = computed(() => this.access()?.identity ?? null);

  /** Projets que cet accès atteint, s'il vient d'une identité vérifiée. */
  readonly repos = computed(() => this.access()?.repos ?? null);

  /** Les quatre derniers caractères, pour identifier le jeton sans l'exposer. */
  readonly fingerprint = computed(() => {
    const j = this.applicableToken();
    return j ? `…${j.slice(-4)}` : null;
  });

  /**
   * Sous quelle portée le jeton courant s'applique, pour le dire à l'écran.
   *
   * `null` quand aucun jeton ne s'applique, `''` quand c'est le jeton général.
   */
  readonly currentScope = computed<string | null>(() => {
    const d = this.currentRepo();
    if (d) {
      const { organization, exact } = repoKeys(d);
      const byScope = this.byScope();
      if (byScope.has(exact)) return exact;
      if (byScope.has(organization)) return organization;
    }
    return this.token() ? "" : null;
  });

  /**
   * Le jeton à présenter à la plateforme.
   *
   * L'accès temporaire prime sur le jeton personnel : quelqu'un qui vient de
   * s'identifier attend d'écrire sous cette identité, non sous un jeton qu'il
   * avait saisi la veille.
   *
   * Un accès expiré n'est pas rendu — le présenter produirait un refus dont la
   * cause serait invisible au rédacteur.
   */
  value(): string | null {
    return this.valueFor(this.currentRepo());
  }

  /**
   * Le jeton à présenter pour un dépôt nommé, sans déplacer la cible.
   *
   * La cible est un état partagé : la déplacer le temps d'un appel ferait
   * présenter le mauvais jeton aux appels lancés en parallèle — ceux qui
   * vérifient, dépôt par dépôt, lequel porte un référentiel.
   */
  valueFor(repoRef: { owner: string; repo: string } | null): string | null {
    const a = this.access();
    if (a) {
      if (Date.parse(a.validUntil) > Date.now()) return a.token;
      // expiré : on l'oublie, pour que la source cesse de l'annoncer
      this.access.set(null);
    }
    return this.applicableToken(repoRef);
  }

  /** Enregistre un accès obtenu contre une identité vérifiée. */
  setAccess(access: TemporaryAccess): void {
    this.access.set(access);
  }

  /**
   * Oublie l'accès temporaire, sans toucher au jeton personnel.
   *
   * Les contenus privés sont effacés tous : rien ne distingue ceux que cet
   * accès a lus de ceux d'un jeton personnel, et en effacer trop ne coûte
   * qu'un téléchargement, quand en garder trop survivrait à l'accès.
   */
  eraseAccess(): void {
    this.access.set(null);
    void this.cache.clearPrivate();
  }

  /**
   * Charge les jetons du coffre de la cible.
   *
   * Appelé une fois au démarrage, avant que le routeur n'active quoi que ce
   * soit : le garde de route lance la lecture du dépôt et doit la lancer avec le
   * jeton en main plutôt qu'en anonyme.
   */
  async initialize(): Promise<void> {
    this.forgetLegacyVault();
    const stored = await this.vault.loadTokens();
    this.token.set(stored.general);
    this.byScope.set(new Map(stored.byScope));
    this.readSealingState();
  }

  /**
   * Ce que demande le projet ouvert. Exigée, la passkey l'est pour le reste de l'onglet ; et des jetons que le navigateur gardait en clair en sont retirés aussitôt, l'onglet les gardant en mémoire : un jeton qui ouvre ce projet n'est jamais gardé en clair (RG-protection-du-jeton-par-projet).
   */
  requireProtection(protection: TokenProtection): void {
    if (protection !== "exigee" || this.required()) return;
    this.required.set(true);
    if (this.form() === "session")
      void this.vault
        .deleteTokens()
        .then((writing) => this.recordWrite(writing, "effacement"));
  }

  /** Vrai quand ce navigateur peut sceller les jetons ; seul l'essai le confirme. */
  async canProtect(): Promise<boolean> {
    return (await this.sealing?.isPossible()) ?? false;
  }

  /**
   * Scelle les jetons en place par une passkey. À appeler depuis un geste de l'utilisateur : le navigateur ne sollicite la passkey qu'ainsi.
   */
  async protect(): Promise<SealingOutcome> {
    if (!this.sealing) return "impossible";
    const issue = await this.sealing.sealTokens(this.content());
    this.passkeyFailure.set(issue === "scelle" ? null : issue);
    if (issue === "scelle") await this.openCache();
    return issue;
  }

  /**
   * Enregistre un jeton et le scelle d'un même geste, sans jamais l'écrire en clair. `cle` vide : le jeton général. Si la passkey n'est pas créée, le jeton est gardé comme le projet le permet : en clair, ou pour l'onglet seulement.
   */
  async setProtected(key: string, token: string): Promise<SealingOutcome> {
    const own = token.trim();
    if (!own) return "annule";
    this.keep(key, own);
    const issue = await this.protect();
    if (issue !== "scelle") this.persist();
    return issue;
  }

  /** Le rédacteur a lu l'échec, et garde le jeton tel qu'il est : il n'est plus rappelé. */
  dismissPasskeyFailure(): void {
    this.passkeyFailure.set(null);
  }

  /** Ouvre les jetons scellés. À appeler depuis un geste de l'utilisateur. */
  async unlock(): Promise<"ouvert" | PasskeyFailure> {
    if (!this.sealing) return "impossible";
    const opened = await this.sealing.unlockTokens();
    this.passkeyFailure.set(opened.issue === "ouvert" ? null : opened.issue);
    if (opened.issue !== "ouvert") return opened.issue;
    this.token.set(opened.tokens.general);
    this.byScope.set(new Map(opened.tokens.byScope));
    this.readSealingState();
    return "ouvert";
  }

  /**
   * Ouvre les jetons scellés dès l'ouverture de l'onglet, sans attendre de clic : Touch ID ou le code de l'appareil restent le geste (RG-secret-conserve-localement). Un navigateur qui exige un clic dans la page refuse comme on annule — WebAuthn ne les distingue pas —, et ce refus ne se dit pas : le bandeau propose simplement de déverrouiller.
   */
  async unlockWithoutGesture(): Promise<"ouvert" | PasskeyFailure> {
    const issue = await this.unlock();
    if (issue === "annule") this.passkeyFailure.set(null);
    return issue;
  }

  private readSealingState(): void {
    this.sealingState.set(this.sealing?.state ?? "aucun");
    const cipher = this.sealing?.findCipher() ?? null;
    if (cipher) this.cache.encryptWith(cipher);
    else if (this.locked()) this.cache.lock();
  }

  /** Ce que le cache gardait en clair ne survit pas au scellement : il se relira, sous la clé. */
  private async openCache(): Promise<void> {
    await this.cache.clearPrivate();
    this.readSealingState();
  }

  /**
   * Efface ce qu'une version chiffrée avait laissé.
   *
   * Sans passphrase pour l'ouvrir, ce coffre n'est plus qu'un encombrant : le
   * retirer libère la place et évite qu'un futur lecteur croie y trouver
   * quelque chose.
   */
  private forgetLegacyVault(): void {
    try {
      localStorage.removeItem(LEGACY_VAULT_KEY);
      sessionStorage.removeItem(LEGACY_SESSION_KEY);
    } catch {
      // stockage bloqué : rien à nettoyer
    }
  }

  /** Écrit l'état courant dans le coffre ; rien, quand ils ne valent que pour l'onglet. */
  private persist(): void {
    if (this.form() === "session") return;
    void this.vault
      .saveTokens(this.content())
      .then((writing) => this.recordWrite(writing, "ecriture"));
  }

  private recordWrite(
    writing: VaultWrite,
    gesture: "ecriture" | "effacement",
  ): void {
    this.vaultRefused.set(writing === "refusee" ? gesture : null);
  }

  private content(): StoredTokens {
    return {
      general: this.token(),
      byScope: [...this.byScope().entries()],
    };
  }

  set(token: string): void {
    const own = token.trim();
    if (!own) return;
    this.token.set(own);
    this.persist();
  }

  /** Garde un jeton en mémoire, sans l'écrire : `cle` vide, le jeton général. */
  private keep(key: string, token: string): void {
    if (!key) {
      this.token.set(token);
      return;
    }
    const next = new Map(this.byScope());
    next.set(key.toLowerCase(), token);
    this.byScope.set(next);
  }

  /** Efface tout : les jetons stockés, ceux en mémoire, et l'accès temporaire. */
  erase(): void {
    this.token.set(null);
    this.access.set(null);
    this.byScope.set(new Map());
    void this.vault.deleteTokens().then((writing) => {
      this.recordWrite(writing, "effacement");
      this.readSealingState();
    });
    // Le scellé part avec les jetons : ce que le cache gardera ensuite le sera comme eux, en clair.
    this.sealingState.set("aucun");
    this.passkeyFailure.set(null);
    this.cache.encryptWith(null);
    void this.cache.clearPrivate();
  }

  /** Enregistre un jeton pour une portée — une organisation, ou un dépôt. */
  setForScope(key: string, token: string): void {
    const own = token.trim();
    if (!own) return;
    const next = new Map(this.byScope());
    next.set(key.toLowerCase(), own);
    this.byScope.set(next);
    this.persist();
  }

  /** Retire le jeton d'une portée. */
  forgetScope(key: string): void {
    const scope = key.toLowerCase();
    const next = new Map(this.byScope());
    next.delete(scope);
    this.byScope.set(next);
    this.persist();
    // Un dépôt que le jeton général couvre encore sera simplement relu.
    void this.cache.clearPrivate(
      (repoRef) => repoRef === scope || repoRef.startsWith(`${scope}/`),
    );
  }

  /**
   * Vérifie la forme d'un jeton avant de l'enregistrer.
   *
   * On ne valide pas la validité — seul GitHub peut le faire — mais on attrape
   * les erreurs de saisie les plus fréquentes : un identifiant collé à la place
   * du jeton, ou un jeton tronqué.
   */
  static checkForm(token: string): string | null {
    const j = token.trim();
    if (!j) return "Saisir un jeton.";
    if (/\s/.test(j)) return "Un jeton ne contient pas d’espace.";
    if (!/^(ghp_|github_pat_|gho_|ghu_|ghs_)/.test(j)) {
      return "Un jeton GitHub commence par ghp_ ou github_pat_.";
    }
    if (j.length < 20) return "Ce jeton semble incomplet.";
    return null;
  }
}
