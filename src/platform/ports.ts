/**
 * What the interface asks of the system, and nothing more. Each target — the desktop application, the web version — provides its adapters; only the composition root of each deliverable chooses them, `src/main.ts` for the web (docs/practices.md, "The boundary with the system").
 */

/** The general token, and the tokens by scope (RG-secret-conserve-localement). */
export interface StoredTokens {
  readonly general: string | null;
  readonly byScope: readonly (readonly [string, string])[];
}

/**
 * What became of a write to the vault. Refused, the secret is valid for the session in memory, and the interface says so: it will not be found at the next launch — or, for an erasure, it will be (RG-secret-conserve-localement).
 */
export type VaultWrite = "faite" | "refusee";

/**
 * Where access tokens live. No operation throws: an unavailable vault leaves the tokens valid for the session in memory, it does not prevent the application from starting.
 */
export interface TokenVault {
  /** What the vault keeps; nothing if the vault is empty or unreadable. */
  loadTokens(): Promise<StoredTokens>;
  saveTokens(tokens: StoredTokens): Promise<VaultWrite>;
  deleteTokens(): Promise<VaultWrite>;
}

/**
 * Where tokens sealed by a passkey stand: nothing sealed (the vault keeps them in plain text, or keeps none), sealed but closed for this page, or opened by a user gesture.
 */
export type SealingState = "aucun" | "verrouille" | "ouvert";

/** What became of a sealing request. `impossible`: this browser or this device returns no key (PRF). */
export type SealingOutcome = "scelle" | "annule" | "impossible";

/**
 * What an unlock returned. `annule` also covers the passkey not found: the browser does not tell a user's refusal from a deleted passkey, out of discretion. `illisible`: the returned key does not open the ciphertext.
 */
export type UnlockOutcome =
  | { readonly issue: "ouvert"; readonly tokens: StoredTokens }
  | { readonly issue: "annule" }
  | { readonly issue: "illisible" };

/** Encrypts a text under the passkey's key, for what the machine keeps of a private repo (RG-contenus-prives-au-repos). */
export interface Cipher {
  seal(text: string): Promise<string>;
  /** The text, or `null` when the sealed text does not open under this key. */
  open(sealed: string): Promise<string | null>;
}

/**
 * Sealing tokens with a passkey, in the web version (RG-secret-conserve-localement). The key never leaves the user's keychain, and is only obtained through a gesture: only the ciphertext stays in the browser. Each call that requests the passkey must start from a user gesture in the page.
 *
 * The desktop application has none: the system vault already keeps tokens outside the page.
 */
export interface TokenSealing {
  /** The state since the last load, sealing or unlock. */
  readonly state: SealingState;
  /** False when this browser surely cannot seal; true guarantees nothing, only trying tells. */
  isPossible(): Promise<boolean>;
  /** Seals these tokens, and erases what the vault kept in plain text. */
  sealTokens(tokens: StoredTokens): Promise<SealingOutcome>;
  /** Opens the sealed tokens for this page, through the passkey. To be called from a user gesture. */
  unlockTokens(): Promise<UnlockOutcome>;
  /** Opens them with the key an open tab of the application already holds, without the passkey; `null` when no open tab answers with a key that opens them (2026-065, decision 01). */
  joinOpenTabs(): Promise<UnlockOutcome | null>;
  /** What another tab did to the sealed store: opened it — these tokens —, or removed it — `null`. */
  listenChanges(onChange: (tokens: StoredTokens | null) => void): void;
  /** False when the browser surely cannot offer the passkey through its autofill, with the key (2026-065, decision 02). */
  canOffer(): Promise<boolean>;
  /** Offers the passkey through the browser's autofill, until the user picks it or `signal` withdraws the offer. */
  offerUnlock(signal: AbortSignal): Promise<UnlockOutcome>;
  /** True when the author chose, in this browser, to do without the passkey wherever their project leaves them the choice (2026-065, decision 03). */
  readonly optedOut: boolean;
  /** Records that choice; false when the browser refuses to keep it. */
  optOut(value: boolean): boolean;
  /** Keeps these open tokens in plain text again, and removes the sealed store. Refused while they are locked. */
  unsealTokens(tokens: StoredTokens): Promise<VaultWrite>;
  /** The cipher for private contents, as long as the tokens are open; `null` otherwise. */
  findCipher(): Cipher | null;
}

/** Opens an address outside the application, in the user's browser. */
export interface ExternalOpener {
  open(url: string): Promise<void>;
}

/**
 * The deep links the system hands to the application (RG-ouverture-par-protocole). The receiver returns them whole, scheme included: the `/ouvrir` route is what validates them, for both targets.
 */
export interface LinkReceiver {
  /** The link that launched the application, if there is one, then each link received afterwards. */
  listen(onLink: (link: string) => void): Promise<void>;
}

/**
 * What whoever delivers the application announces: a more recent version, ready to serve, or the current version that is no longer fully available (RG-nouvelle-version-proposee, RG-version-perdue-signalee).
 */
export type VersionAnnouncement = "prete" | "perdue";

/**
 * Why no version is announced. The announcer names it, and only the deliverable that knows it words it (RG-message-nomme-la-cause): the shared interface receives it without knowing the list. The type is branded so that no text of the shared interface can name one by mistake.
 */
export type NoVersionCause = string & { readonly __noVersionCause: never };

/** The only cause the shared interface observes itself: the ready version could not be installed. */
export const INSTALLATION_FAILED = "installation-echouee" as NoVersionCause;

/**
 * What announces a version. The web version learns it from its service worker; the desktop application, from its native core.
 */
export interface VersionAnnouncer {
  /** False when nothing can be announced: no service worker, development server. */
  readonly active: boolean;
  /** True when moving to the ready version relaunches the application, rather than reloading the page: on the desktop. */
  readonly relaunches: boolean;
  /** Each announcement, as it arrives; returns a way to stop listening. */
  listen(
    onAnnouncement: (announcement: VersionAnnouncement) => void,
  ): () => void;
  /** The cause of the last check that found no version, `null` when it succeeded. The web version announces none: its service worker stays silent. */
  listenCause(onCause: (cause: NoVersionCause | null) => void): () => void;
  /** Asks whether a more recent version is published; the answer arrives through `listen`. May fail, offline for instance. */
  check(): Promise<void>;
  /** Has the ready version served: at the next load on the web, by relaunching on the desktop. May fail. */
  activate(): Promise<void>;
}

/**
 * The window's title bar, when the system draws its controls over the application's top bar rather than above it: on the desktop under macOS. The shell then leaves those controls room at the bar's start, and lets the window be moved from the bar's background.
 */
export interface TitleBar {
  /** The width the window's controls take from the window's left edge, in pixels, at once then at each change; 0 when the system hides them, in full screen. Returns a way to stop listening. */
  listenControlsWidth(onWidth: (width: number) => void): () => void;
  /** Lets the user move the window by pressing on this element's background, never on a control it holds. Returns a way to stop. */
  makeDraggable(bar: HTMLElement): () => void;
}

/** A repo, by its owner and its name. */
export interface RepoCoordinates {
  readonly owner: string;
  readonly repo: string;
}

/** An entry of a repo at a commit: its path, and the fingerprint of its content. */
export interface SourceEntry {
  readonly path: string;
  readonly sha: string;
  readonly type: "blob" | "tree";
}

/** A repo at a commit, as a content source holds it. */
export interface SourceSnapshot {
  readonly commit: string;
  readonly entries: readonly SourceEntry[];
  /** When the source last heard from the repo, in ISO format. */
  readonly receivedAt: string;
}

/**
 * What an update returned. `echec`: the repo did not answer as hoped — `status` is the platform's, 0 when the network fails —, and `known` is the last state the source received, if it holds one.
 */
export type SourceUpdate =
  | { readonly issue: "recu"; readonly snapshot: SourceSnapshot }
  | {
      readonly issue: "echec";
      readonly status: number;
      readonly known: SourceSnapshot | null;
    };

/**
 * A copy of each opened repo that the system keeps and brings up to date itself, outside the API quota (RG-chargement-hors-quota). The interface reads the tree and the contents from it, and still writes through the API.
 *
 * The web version has none: the page reads through the API and keeps contents in its own cache (RG-contenus-par-empreinte).
 */
export interface ContentSource {
  /** Brings the copy up to date with the repo, then describes it at `ref` — a branch, a commit, or `HEAD`. `token` serves this exchange only: the source keeps it nowhere. */
  update(
    repo: RepoCoordinates,
    ref: string,
    token: string | null,
  ): Promise<SourceUpdate>;
  /** The contents with these fingerprints, from the copy, in the same order. */
  read(repo: RepoCoordinates, shas: readonly string[]): Promise<string[]>;
  /** Erases the copy of a repo. */
  forgetRepo(repo: RepoCoordinates): Promise<void>;
  /** Erases the copies read under a token, within a scope — an organisation or a repo —, or all of them (RG-contenus-prives-au-repos). */
  forgetReadUnderToken(scope: string | null): Promise<void>;
}

export interface Platform {
  readonly target: "bureau" | "web";
  readonly vault: TokenVault;
  /** Token sealing by passkey; `null` on the desktop, where the system vault is enough. */
  readonly sealing: TokenSealing | null;
  /** The copy of the repos the system keeps; `null` in the web version, which reads through the API. */
  readonly contentSource: ContentSource | null;
  readonly opener: ExternalOpener;
  readonly links: LinkReceiver;
  readonly version: VersionAnnouncer;
  /** The version this window runs, as the bottom bar shows it: the published number on the desktop, the built commit on the web. */
  readonly loadVersion: () => Promise<string>;
  /** `null` where the system draws its own title bar, above the application: on the web, and on the desktop outside macOS. */
  readonly titleBar: TitleBar | null;
}

/** The deep link scheme: `skanon:ssk-it/ssk-canon/cadrages/2026-047`. */
export const DEEP_LINK_SCHEME = "skanon";
