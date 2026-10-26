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
import { githubText } from "./github.messages";

/**
 * The key of the former encrypted vault, erased at startup.
 *
 * Its content is not recoverable: it was sealed under a passphrase that
 * nothing asks for anymore. Keeping it would only sustain the illusion that it is.
 */
const LEGACY_VAULT_KEY = "ssk-canon.coffre";
const LEGACY_SESSION_KEY = "ssk-canon.cle-session";

/**
 * What a token applies to.
 *
 * Two levels, because the platform uses two: the organisation is the
 * boundary where approval and policies are decided, and so it is the
 * common case; a repo may nonetheless ask for its own — write access
 * where the rest of the organisation is read-only.
 */
export interface ScopedToken {
  /** `organisation` or `organisation/repo`. */
  readonly key: string;
  readonly token: string;
}

/** A repo's organisation key, and the repo's exact key. */
export function repoKeys(repoRef: { owner: string; repo: string }): {
  organization: string;
  exact: string;
} {
  const org = repoRef.owner.toLowerCase();
  return { organization: org, exact: `${org}/${repoRef.repo.toLowerCase()}` };
}

/** An access obtained in exchange for a verified identity, and what it opens. */
export interface TemporaryAccess {
  readonly token: string;
  /** Instant beyond which it must no longer be presented. */
  readonly validUntil: string;
  readonly repos: readonly string[];
  readonly identity: {
    readonly identifier: string;
    readonly name: string;
    readonly email: string | null;
  };
}

/** Where the current token comes from. */
export type TokenSource = "aucune" | "personnel" | "identite_tierce";

/**
 * In what form tokens are kept on the machine, so that the interface says so (RG-secret-conserve-localement): in the system vault (desktop), in plain text in the browser, sealed by a passkey, or for the tab only — a project in the tab requires the passkey, and they are not sealed (RG-protection-du-jeton-par-projet).
 */
export type TokenForm = "systeme" | "en-clair" | "scelle" | "session";

/** What the last passkey request gave, when it did not succeed. */
export type PasskeyFailure = "annule" | "impossible" | "illisible";

/**
 * The GitHub access token.
 *
 * Single substitution point for phase 7: the proxy will replace manual
 * input by providing an installation token, and nothing else will change
 * in the application — `GithubClient` queries this service, not the storage.
 *
 * Tokens are kept in the target's vault — see `platform/ports.ts`
 * for what that is worth. Hence the advice, which prevails here: grant only a
 * least-privilege token, and revoke it on GitHub the day it no longer
 * has a reason to exist.
 */
export class TokenService {
  /**
   * Private contents read under an access do not outlive it: forgetting a
   * token erases what it had opened. See RG-contenus-prives-au-repos.
   */
  private readonly cache = inject(ContentCache);

  /**
   * The target's vault: the system's in the desktop application, local storage in the web version (INV-8). Its writes are not awaited: each call goes out in the order the state changes, and an unavailable vault leaves the tokens valid for the session.
   */
  private readonly vault = inject(PLATFORM).vault;

  /** The web version's passkey sealing; `null` on the desktop, whose system vault is enough. */
  private readonly sealing = inject(PLATFORM).sealing;

  /** The sealed store's state, read after each gesture: the vault holds it, but does not report it. */
  private readonly sealingState = signal<SealingState>("aucun");

  /**
   * True as soon as a project open in this tab requires the passkey, and until the tab closes: a token can open several projects, and it is kept according to the most demanding of them (RG-protection-du-jeton-par-projet).
   */
  private readonly required = signal(false);

  /** True when sealed tokens are waiting for a user gesture to open. */
  readonly locked = computed(() => this.sealingState() === "verrouille");

  readonly form = computed<TokenForm>(() => {
    if (!this.sealing) return "systeme";
    if (this.sealingState() !== "aucun") return "scelle";
    return this.required() ? "session" : "en-clair";
  });

  /** True when a project in the tab requires the passkey, to say so. */
  readonly protectionRequired = computed(() => this.required());

  /** What the last passkey request gave, to say so; `null` after a success. */
  readonly passkeyFailure = signal<PasskeyFailure | null>(null);

  /**
   * What the vault refused at the last write: keeping the tokens (`ecriture`) — they are valid for the session and will not be found at the next launch —, or erasing them (`effacement`) — they will be found there. `null` when it accepted. RG-secret-conserve-localement: the interface says so.
   */
  readonly vaultRefused = signal<"ecriture" | "effacement" | null>(null);

  private readonly token = signal<string | null>(null);

  /**
   * Tokens by scope, from the most general to the most precise.
   *
   * An author works on projects belonging to several
   * organisations, and a token may cover only one of them — restricted to
   * a selection of repos, subject to the organisation's approval, expiring
   * on its own date. Keeping only one amounted to overwriting the previous one without
   * a word, then presenting « dépôt introuvable » on a very real repo.
   */
  private readonly byScope = signal<ReadonlyMap<string, string>>(new Map());

  /**
   * The repo for which the token is chosen.
   *
   * Supplied from outside rather than read: this service is queried by the
   * access layer, and depending in return on the repo's configuration would make
   * a cycle.
   */
  private readonly currentRepo = signal<{
    owner: string;
    repo: string;
  } | null>(null);

  /** Says for which repo the tokens must be chosen. */
  targetRepo(repoRef: { owner: string; repo: string } | null): void {
    this.currentRepo.set(repoRef);
  }

  /** The current target, to restore it after moving it. */
  currentTarget(): { owner: string; repo: string } | null {
    return this.currentRepo();
  }

  /** The declared scopes, to present and modify them. */
  readonly scopes = computed(() =>
    [...this.byScope().entries()]
      .map(([key, token]) => ({ key: key, token: token }))
      .sort((a, b) => a.key.localeCompare(b.key)),
  );

  /**
   * The token that applies to the current repo.
   *
   * The most precise wins: a token declared for `org/repo` takes precedence over that
   * of `org`, which takes precedence over the general token. Without this gradation, declaring a
   * particular access to one repo would require redeclaring it for all the
   * others of the organisation.
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
   * Access obtained in exchange for a verified identity.
   *
   * It does not go into browser storage: it expires within an hour, and
   * finding it the next day would only produce authorisation errors whose
   * cause would be invisible. Losing it on reload is the right behaviour —
   * a new verified identity gives it back at once.
   */
  private readonly access = signal<TemporaryAccess | null>(null);

  /** True if a token is available, whatever its source. */
  readonly present = computed(() => this.value() !== null);

  /**
   * True if nothing is saved: no general token, no scoped token, no temporary access.
   *
   * `present` only answers for the targeted repo: a token saved for another organisation counts for nothing there, even though it is indeed in place (RG-acces-par-portee).
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

  /** Who obtained the current access, if it comes from a verified identity. */
  readonly identity = computed(() => this.access()?.identity ?? null);

  /** Projects this access reaches, if it comes from a verified identity. */
  readonly repos = computed(() => this.access()?.repos ?? null);

  /** The last four characters, to identify the token without exposing it. */
  readonly fingerprint = computed(() => {
    const j = this.applicableToken();
    return j ? `…${j.slice(-4)}` : null;
  });

  /**
   * Under which scope the current token applies, to show it on screen.
   *
   * `null` when no token applies, `''` when it is the general token.
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
   * The token to present to the platform.
   *
   * Temporary access takes precedence over the personal token: someone who has just
   * identified expects to write under that identity, not under a token they
   * had entered the day before.
   *
   * An expired access is not returned — presenting it would produce a refusal whose
   * cause would be invisible to the author.
   */
  value(): string | null {
    return this.valueFor(this.currentRepo());
  }

  /**
   * The token to present for a named repo, without moving the target.
   *
   * The target is shared state: moving it for the duration of a call would
   * present the wrong token to calls launched in parallel — those that
   * check, repo by repo, which one carries a specification.
   */
  valueFor(repoRef: { owner: string; repo: string } | null): string | null {
    const a = this.access();
    if (a) {
      if (Date.parse(a.validUntil) > Date.now()) return a.token;
      // expired: we forget it, so that the source stops announcing it
      this.access.set(null);
    }
    return this.applicableToken(repoRef);
  }

  /** Saves an access obtained in exchange for a verified identity. */
  setAccess(access: TemporaryAccess): void {
    this.access.set(access);
  }

  /**
   * Forgets the temporary access, without touching the personal token.
   *
   * Private contents are all erased: nothing distinguishes those this
   * access read from those of a personal token, and erasing too much only costs
   * a download, whereas keeping too much would outlive the access.
   */
  eraseAccess(): void {
    this.access.set(null);
    void this.cache.clearPrivate();
  }

  /**
   * Loads the tokens from the target's vault.
   *
   * Called once at startup, before the router activates anything:
   * the route guard starts reading the repo and must start it with the
   * token in hand rather than anonymously.
   */
  async initialize(): Promise<void> {
    this.forgetLegacyVault();
    const stored = await this.vault.loadTokens();
    this.token.set(stored.general);
    this.byScope.set(new Map(stored.byScope));
    this.readSealingState();
  }

  /**
   * What the open project asks for. When required, the passkey is required for the rest of the tab; and tokens the browser kept in plain text are removed from it at once, the tab keeping them in memory: a token that opens this project is never kept in plain text (RG-protection-du-jeton-par-projet).
   */
  requireProtection(protection: TokenProtection): void {
    if (protection !== "exigee" || this.required()) return;
    this.required.set(true);
    if (this.form() === "session")
      void this.vault
        .deleteTokens()
        .then((writing) => this.recordWrite(writing, "effacement"));
  }

  /** True when this browser can seal the tokens; only trying confirms it. */
  async canProtect(): Promise<boolean> {
    return (await this.sealing?.isPossible()) ?? false;
  }

  /**
   * Seals the tokens in place with a passkey. To be called from a user gesture: the browser only requests the passkey that way.
   */
  async protect(): Promise<SealingOutcome> {
    if (!this.sealing) return "impossible";
    const issue = await this.sealing.sealTokens(this.content());
    this.passkeyFailure.set(issue === "scelle" ? null : issue);
    if (issue === "scelle") await this.openCache();
    return issue;
  }

  /**
   * Saves a token and seals it in a single gesture, without ever writing it in plain text. Empty `key`: the general token. If the passkey is not created, the token is kept as the project allows: in plain text, or for the tab only.
   */
  async setProtected(key: string, token: string): Promise<SealingOutcome> {
    const own = token.trim();
    if (!own) return "annule";
    this.keep(key, own);
    const issue = await this.protect();
    if (issue !== "scelle") this.persist();
    return issue;
  }

  /** The author has read the failure, and keeps the token as it is: it is no longer brought up. */
  dismissPasskeyFailure(): void {
    this.passkeyFailure.set(null);
  }

  /** Opens the sealed tokens. To be called from a user gesture. */
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
   * Opens the sealed tokens as soon as the tab opens, without waiting for a click: Touch ID or the device code remain the gesture (RG-secret-conserve-localement). A browser that requires a click in the page refuses the way one cancels — WebAuthn does not distinguish them —, and this refusal is not reported: the banner simply offers to unlock.
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

  /** What the cache kept in plain text does not survive sealing: it will be reread, under the key. */
  private async openCache(): Promise<void> {
    await this.cache.clearPrivate();
    this.readSealingState();
  }

  /**
   * Erases what an encrypted version had left.
   *
   * Without a passphrase to open it, this vault is nothing but clutter:
   * removing it frees the space and keeps a future reader from believing they will find
   * something in it.
   */
  private forgetLegacyVault(): void {
    try {
      localStorage.removeItem(LEGACY_VAULT_KEY);
      sessionStorage.removeItem(LEGACY_SESSION_KEY);
    } catch {
      // blocked storage: nothing to clean up
    }
  }

  /** Writes the current state into the vault; nothing, when they are only valid for the tab. */
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

  /** Keeps a token in memory, without writing it: empty `key`, the general token. */
  private keep(key: string, token: string): void {
    if (!key) {
      this.token.set(token);
      return;
    }
    const next = new Map(this.byScope());
    next.set(key.toLowerCase(), token);
    this.byScope.set(next);
  }

  /** Erases everything: stored tokens, those in memory, and the temporary access. */
  erase(): void {
    this.token.set(null);
    this.access.set(null);
    this.byScope.set(new Map());
    void this.vault.deleteTokens().then((writing) => {
      this.recordWrite(writing, "effacement");
      this.readSealingState();
    });
    // The sealed store goes with the tokens: what the cache keeps afterwards will be kept like them, in plain text.
    this.sealingState.set("aucun");
    this.passkeyFailure.set(null);
    this.cache.encryptWith(null);
    void this.cache.clearPrivate();
  }

  /** Saves a token for a scope — an organisation, or a repo. */
  setForScope(key: string, token: string): void {
    const own = token.trim();
    if (!own) return;
    const next = new Map(this.byScope());
    next.set(key.toLowerCase(), own);
    this.byScope.set(next);
    this.persist();
  }

  /** Removes a scope's token. */
  forgetScope(key: string): void {
    const scope = key.toLowerCase();
    const next = new Map(this.byScope());
    next.delete(scope);
    this.byScope.set(next);
    this.persist();
    // A repo the general token still covers will simply be reread.
    void this.cache.clearPrivate(
      (repoRef) => repoRef === scope || repoRef.startsWith(`${scope}/`),
    );
  }

  /**
   * Checks a token's shape before saving it.
   *
   * We do not validate validity — only GitHub can do that — but we catch
   * the most frequent input errors: an identifier pasted instead
   * of the token, or a truncated token.
   */
  static checkForm(token: string): string | null {
    const j = token.trim();
    const t = githubText();
    if (!j) return t.tokenEmpty;
    if (/\s/.test(j)) return t.tokenWithSpace;
    if (!/^(ghp_|github_pat_|gho_|ghu_|ghs_)/.test(j)) return t.tokenPrefix;
    if (j.length < 20) return t.tokenTooShort;
    return null;
  }
}
