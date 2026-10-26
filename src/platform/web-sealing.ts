import type {
  Cipher,
  TokenVault,
  VaultWrite,
  SealingState,
  UnlockOutcome,
  SealingOutcome,
  StoredTokens,
  TokenSealing,
} from "./ports";
import { BrowserVault, toPairs } from "./web-vault";

/**
 * The tokens' sealed store, and the identifier of the passkey that opens it. The identifier is not secret at all: it designates the passkey, it gives nothing of it away. It survives the erasure of the tokens, so that the next sealing reuses the same passkey rather than adding one to the keychain.
 */
const SEALED_KEY = "skanon.jetons-scelles";
const PASSKEY_KEY = "skanon.passkey";

/** The author's choice to do without the passkey in this browser. Not secret: it says how tokens are kept, not what they are. */
const OPT_OUT_KEY = "skanon.sans-passkey";

/** How long a new tab waits for an open tab to hand it the key: an open tab answers in a few milliseconds, and a load that waits for nobody must not be held back. */
const JOIN_DELAY_MS = 200;

/** What the passkey is asked to encrypt with its secret (PRF): a fixed value, which nothing requires to keep quiet. Changing it would make every sealed store unreadable. */
const SALT = new TextEncoder().encode("skanon:coffre:v1");

/** Two keys drawn from the same output, one per use: what encrypts the tokens does not encrypt the contents. */
const TOKENS_USAGE = new TextEncoder().encode("skanon:jetons");
const CONTENTS_USAGE = new TextEncoder().encode("skanon:contenus");

/** A freshly created passkey. `prf`: the output, when the browser returns it at creation; `prfEnabled` false: this passkey cannot return one. */
export interface CreatedPasskey {
  readonly id: Uint8Array<ArrayBuffer>;
  readonly prf: ArrayBuffer | null;
  readonly prfEnabled: boolean;
}

/**
 * What the vault asks of WebAuthn, isolated so that tests can fake it: jsdom has none. Each call prompts the user.
 */
export interface Authenticator {
  isPossible(): Promise<boolean>;
  /** Creates a passkey for this site; `null` if the user cancels. */
  create(salt: Uint8Array<ArrayBuffer>): Promise<CreatedPasskey | null>;
  /** This passkey's output for this salt; `null` if the user cancels or it is no longer in the keychain. */
  evaluate(
    id: Uint8Array<ArrayBuffer>,
    salt: Uint8Array<ArrayBuffer>,
  ): Promise<ArrayBuffer | null>;
  /** False when the browser surely cannot offer a passkey through its autofill. */
  isConditionalPossible(): Promise<boolean>;
  /** The output of the passkey the user picks in the browser's autofill; `null` if the offer is withdrawn, cancelled, or returns no output. */
  evaluateConditional(
    salt: Uint8Array<ArrayBuffer>,
    signal: AbortSignal,
  ): Promise<ArrayBuffer | null>;
}

/** What tabs of the application tell each other about the key: a new tab asks for it, an open tab hands it over, a tab that removed the sealed store says so. */
export type KeyMessage =
  | { readonly type: "demande" }
  | { readonly type: "cle"; readonly keys: Keys }
  | { readonly type: "retire" };

/** The channel between tabs of the same origin. Like a `BroadcastChannel`, it never hands a tab what it posted itself. */
export interface KeyChannel {
  post(message: KeyMessage): void;
  listen(onMessage: (message: KeyMessage) => void): void;
}

/** The channel of the real browser; `null` where it has none. The keys cross it by structured clone: they stay non-extractable. */
export function browserKeyChannel(): KeyChannel | null {
  if (typeof BroadcastChannel === "undefined") return null;
  const channel = new BroadcastChannel("skanon.cle");
  return {
    post: (message) => {
      try {
        channel.postMessage(message);
      } catch {
        // A browser that cannot clone a key: the other tabs will ask for the passkey.
      }
    },
    listen: (onMessage) =>
      channel.addEventListener("message", (e: MessageEvent<KeyMessage>) =>
        onMessage(e.data),
      ),
  };
}

export interface Keys {
  readonly tokens: CryptoKey;
  readonly contents: CryptoKey;
}

/**
 * The web version's vault, which can seal tokens with a passkey (RG-secret-conserve-localement, 2026-055).
 *
 * As long as nothing is sealed, it keeps tokens in plain text, like `BrowserVault`. Sealed, it keeps only their ciphertext, and the key only exists in memory, after a user gesture: it comes from the passkey, which only returns it to this site and only after Touch ID or the device code. A program that reads the browser profile therefore finds only ciphertext. A script on the page, once open, reads the tokens as the application does: the protection covers data at rest, not the page.
 *
 * The key then passes, through `channel`, from an open tab to the tabs that open afterwards, in memory only: the last tab closed takes it away (2026-065, decision 01). A script on the page can ask for it as the application does — the same exposure, for as long as a tab stays open.
 */
export class BrowserSealedVault implements TokenVault, TokenSealing {
  private readonly clair = new BrowserVault();
  private keys: Keys | null = null;
  private readonly listeners: ((tokens: StoredTokens | null) => void)[] = [];
  /** The answer a join waits for, while it waits. */
  private joining: ((outcome: UnlockOutcome) => void) | null = null;

  constructor(
    private readonly auth: Authenticator,
    private readonly channel: KeyChannel | null = null,
  ) {
    channel?.listen((message) => void this.receive(message));
  }

  get state(): SealingState {
    if (this.keys) return "ouvert";
    return read(SEALED_KEY) ? "verrouille" : "aucun";
  }

  isPossible(): Promise<boolean> {
    return this.auth.isPossible();
  }

  /** Sealed and closed, the tokens cannot be read: nothing is returned, and `state` says why. */
  async loadTokens(): Promise<StoredTokens> {
    if (!read(SEALED_KEY)) return this.clair.loadTokens();
    if (!this.keys) return NONE;
    return (await this.open(this.keys)) ?? NONE;
  }

  async saveTokens(tokens: StoredTokens): Promise<VaultWrite> {
    // Writing in plain text next to the sealed store would undo the protection; overwriting it without the key would lose the sealed tokens.
    if (!this.keys) {
      if (read(SEALED_KEY)) return "refusee";
      return this.clair.saveTokens(tokens);
    }
    return this.writeSealed(this.keys, tokens);
  }

  async deleteTokens(): Promise<VaultWrite> {
    if (this.keys) this.channel?.post({ type: "retire" });
    this.keys = null;
    const sealed = erase(SEALED_KEY);
    const clair = await this.clair.deleteTokens();
    return sealed && clair === "faite" ? "faite" : "refusee";
  }

  async sealTokens(tokens: StoredTokens): Promise<SealingOutcome> {
    let output: ArrayBuffer | "impossible" | null;
    try {
      output = await this.passkeyOutput();
    } catch {
      // What WebAuthn refuses other than through a gesture — passkey not supported, insecure context — is not retried.
      return "impossible";
    }
    if (output === null) return "annule";
    if (output === "impossible") return "impossible";
    const keys = await deriveKeys(output);
    if ((await this.writeSealed(keys, tokens)) === "refusee")
      return "impossible";
    this.share();
    return "scelle";
  }

  async unlockTokens(): Promise<UnlockOutcome> {
    const id = readId();
    if (!read(SEALED_KEY) || !id) return { issue: "illisible" };
    let output: ArrayBuffer | null;
    try {
      output = await this.auth.evaluate(id, SALT);
    } catch {
      return { issue: "annule" };
    }
    return this.openWith(output);
  }

  async joinOpenTabs(): Promise<UnlockOutcome | null> {
    if (!this.channel || this.state !== "verrouille") return null;
    const answer = new Promise<UnlockOutcome | null>((resolve) => {
      this.joining = resolve;
      setTimeout(() => {
        this.joining = null;
        resolve(null);
      }, JOIN_DELAY_MS);
    });
    this.channel.post({ type: "demande" });
    return answer;
  }

  listenChanges(onChange: (tokens: StoredTokens | null) => void): void {
    this.listeners.push(onChange);
  }

  canOffer(): Promise<boolean> {
    return this.auth.isConditionalPossible();
  }

  async offerUnlock(signal: AbortSignal): Promise<UnlockOutcome> {
    if (!read(SEALED_KEY)) return { issue: "illisible" };
    let output: ArrayBuffer | null;
    try {
      output = await this.auth.evaluateConditional(SALT, signal);
    } catch {
      return { issue: "annule" };
    }
    return this.openWith(output);
  }

  get optedOut(): boolean {
    return read(OPT_OUT_KEY) === "1";
  }

  optOut(value: boolean): boolean {
    return value ? write(OPT_OUT_KEY, "1") : erase(OPT_OUT_KEY);
  }

  async unsealTokens(tokens: StoredTokens): Promise<VaultWrite> {
    if (!this.keys) return "refusee";
    if ((await this.clair.saveTokens(tokens)) === "refusee") return "refusee";
    erase(SEALED_KEY);
    this.keys = null;
    this.channel?.post({ type: "retire" });
    return "faite";
  }

  /** Opens the sealed store with a passkey's output, and hands the key to the tabs still locked. */
  private async openWith(output: ArrayBuffer | null): Promise<UnlockOutcome> {
    if (!output) return { issue: "annule" };
    const keys = await deriveKeys(output);
    const tokens = await this.open(keys);
    if (!tokens) return { issue: "illisible" };
    this.keys = keys;
    this.share();
    return { issue: "ouvert", tokens };
  }

  private share(): void {
    if (this.keys) this.channel?.post({ type: "cle", keys: this.keys });
  }

  /** What another tab says. A key is only taken if it opens this tab's sealed store: one sealed again elsewhere would not. */
  private async receive(message: KeyMessage): Promise<void> {
    if (message.type === "demande") return this.share();
    if (message.type === "retire") {
      if (!this.keys) return;
      this.keys = null;
      for (const listener of this.listeners) listener(null);
      return;
    }
    if (this.keys) return;
    const tokens = await this.open(message.keys);
    if (!tokens || this.keys) return;
    this.keys = message.keys;
    const joining = this.joining;
    this.joining = null;
    if (joining) return joining({ issue: "ouvert", tokens });
    for (const listener of this.listeners) listener(tokens);
  }

  findCipher(): Cipher | null {
    const key = this.keys?.contents;
    if (!key) return null;
    return {
      seal: (text) => seal(key, text),
      open: (sealed) => unseal(key, sealed),
    };
  }

  /**
   * The output of the already registered passkey, or of a fresh passkey.
   *
   * The browser does not tell, out of discretion, a deleted passkey from a user's refusal: lacking an output, a fresh one is created. A user who only refused is offered creation, which they can refuse too.
   */
  private async passkeyOutput(): Promise<ArrayBuffer | "impossible" | null> {
    const known = readId();
    const output = known ? await this.auth.evaluate(known, SALT) : null;
    if (output) return output;

    const created = await this.auth.create(SALT);
    if (!created) return null;
    if (!created.prfEnabled) return "impossible";
    if (!write(PASSKEY_KEY, toBase64Url(created.id))) return "impossible";
    // Some browsers only return the output on authentication: a second gesture asks for it.
    return created.prf ?? this.auth.evaluate(created.id, SALT);
  }

  private async writeSealed(
    keys: Keys,
    tokens: StoredTokens,
  ): Promise<VaultWrite> {
    const sealed = await seal(keys.tokens, writeSealedText(tokens));
    if (!write(SEALED_KEY, sealed)) return "refusee";
    this.keys = keys;
    // The plain text does not survive sealing: keeping it would undo the protection.
    await this.clair.deleteTokens();
    return "faite";
  }

  private async open(keys: Keys): Promise<StoredTokens | null> {
    const sealed = read(SEALED_KEY);
    const text = sealed ? await unseal(keys.tokens, sealed) : null;
    return text === null ? null : readSealedText(text);
  }
}

/**
 * The sealed text is a format stored on the machine: its fields keep their original names, `general` and `parPortee`, whatever those of the code. Renaming them would make whoever updates lose their sealed tokens.
 */
export function writeSealedText(tokens: StoredTokens): string {
  return JSON.stringify({ general: tokens.general, parPortee: tokens.byScope });
}

/** The tokens of a sealed text; `null` if it is unreadable. */
export function readSealedText(text: string): StoredTokens | null {
  try {
    const raw = JSON.parse(text) as { general?: unknown; parPortee?: unknown };
    return {
      general: typeof raw.general === "string" ? raw.general : null,
      byScope: toPairs(raw.parPortee),
    };
  } catch {
    return null;
  }
}

const NONE: StoredTokens = { general: null, byScope: [] };

async function deriveKeys(output: ArrayBuffer): Promise<Keys> {
  const base = await crypto.subtle.importKey("raw", output, "HKDF", false, [
    "deriveKey",
  ]);
  const derived = (info: Uint8Array<ArrayBuffer>) =>
    crypto.subtle.deriveKey(
      { name: "HKDF", hash: "SHA-256", salt: new Uint8Array(), info },
      base,
      { name: "AES-GCM", length: 256 },
      // Not extractable: even once opened, the key cannot be copied outside this page.
      false,
      ["encrypt", "decrypt"],
    );
  return {
    tokens: await derived(TOKENS_USAGE),
    contents: await derived(CONTENTS_USAGE),
  };
}

/** `iv.chiffré`, in base64: a fresh vector for each sealing, as AES-GCM requires. */
async function seal(key: CryptoKey, text: string): Promise<string> {
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const encrypted = await crypto.subtle.encrypt(
    { name: "AES-GCM", iv },
    key,
    new TextEncoder().encode(text),
  );
  return `${toBase64Url(iv)}.${toBase64Url(new Uint8Array(encrypted))}`;
}

async function unseal(key: CryptoKey, sealed: string): Promise<string | null> {
  const [iv, encrypted] = sealed.split(".");
  try {
    const clair = await crypto.subtle.decrypt(
      { name: "AES-GCM", iv: fromBase64(iv) },
      key,
      fromBase64(encrypted),
    );
    return new TextDecoder().decode(clair);
  } catch {
    // Another key, a damaged sealed store: AES-GCM refuses it, and that is the intended behaviour.
    return null;
  }
}

function toBase64Url(bytes: Uint8Array): string {
  return btoa(String.fromCharCode(...bytes));
}

/** Throws on a text that is not base64: `unseal` receives it from a storage it does not control, and catches it. */
function fromBase64(text: string | undefined): Uint8Array<ArrayBuffer> {
  if (!text) throw new Error("scellé incomplet");
  return Uint8Array.from(atob(text), (c) => c.charCodeAt(0));
}

function readId(): Uint8Array<ArrayBuffer> | null {
  const raw = read(PASSKEY_KEY);
  if (!raw) return null;
  try {
    return fromBase64(raw);
  } catch {
    return null;
  }
}

// Storage may be blocked: a read then returns nothing, a refused write says so.
function read(key: string): string | null {
  try {
    return localStorage.getItem(key);
  } catch {
    return null;
  }
}

function write(key: string, value: string): boolean {
  try {
    localStorage.setItem(key, value);
    return true;
  } catch {
    return false;
  }
}

function erase(key: string): boolean {
  try {
    localStorage.removeItem(key);
    return true;
  } catch {
    return false;
  }
}

/**
 * WebAuthn, with the PRF extension. The passkey is bound to the domain that serves the application: moving the hosting would make it unusable, and the token would be entered again once (2026-055, « Ce qu'il faut éprouver »).
 */
export class BrowserAuthenticator implements Authenticator {
  async isPossible(): Promise<boolean> {
    if (
      typeof PublicKeyCredential === "undefined" ||
      typeof navigator === "undefined" ||
      !navigator.credentials
    )
      return false;
    // Recent browsers say whether they know PRF; the others say nothing, and only trying decides.
    const capabilities = await (
      PublicKeyCredential as unknown as {
        getClientCapabilities?: () => Promise<Record<string, boolean>>;
      }
    )
      .getClientCapabilities?.()
      .catch(() => null);
    return capabilities?.["extension:prf"] !== false;
  }

  async create(salt: Uint8Array<ArrayBuffer>): Promise<CreatedPasskey | null> {
    const id = crypto.getRandomValues(new Uint8Array(16));
    const credential = await gesture(() =>
      navigator.credentials.create({
        publicKey: {
          rp: { name: "Skanon" },
          user: {
            id,
            name: "Jeton GitHub",
            displayName: "Jeton GitHub de Skanon",
          },
          challenge: crypto.getRandomValues(new Uint8Array(32)),
          pubKeyCredParams: [
            { type: "public-key", alg: -7 },
            { type: "public-key", alg: -257 },
          ],
          authenticatorSelection: {
            residentKey: "preferred",
            userVerification: "required",
          },
          extensions: { prf: { eval: { first: salt } } },
        },
      }),
    );
    if (!(credential instanceof PublicKeyCredential)) return null;
    const prf = credential.getClientExtensionResults().prf;
    return {
      id: new Uint8Array(credential.rawId),
      prf: copy(prf?.results?.first),
      prfEnabled: prf?.enabled ?? !!prf?.results?.first,
    };
  }

  async evaluate(
    id: Uint8Array<ArrayBuffer>,
    salt: Uint8Array<ArrayBuffer>,
  ): Promise<ArrayBuffer | null> {
    const assertion = await gesture(() =>
      navigator.credentials.get({
        publicKey: {
          // No server checks this response: the challenge is only there because WebAuthn requires it.
          challenge: crypto.getRandomValues(new Uint8Array(32)),
          allowCredentials: [{ type: "public-key", id }],
          userVerification: "required",
          extensions: { prf: { eval: { first: salt } } },
        },
      }),
    );
    if (!(assertion instanceof PublicKeyCredential)) return null;
    return copy(assertion.getClientExtensionResults().prf?.results?.first);
  }

  async isConditionalPossible(): Promise<boolean> {
    if (!(await this.isPossible())) return false;
    const available = (
      PublicKeyCredential as unknown as {
        isConditionalMediationAvailable?: () => Promise<boolean>;
      }
    ).isConditionalMediationAvailable;
    return (
      (await available?.call(PublicKeyCredential).catch(() => false)) ?? false
    );
  }

  /**
   * The browser offers this site's passkeys in the field marked `autocomplete="webauthn"`, and waits for the user to pick one: nothing shows until then. No `allowCredentials`: the autofill lists the passkeys itself, and PRF is evaluated on the one picked. A browser that does not return PRF this way gives no output, and the "Unlock" button remains (2026-065, « Ce qu'il faut éprouver »).
   */
  async evaluateConditional(
    salt: Uint8Array<ArrayBuffer>,
    signal: AbortSignal,
  ): Promise<ArrayBuffer | null> {
    const assertion = await gesture(() =>
      navigator.credentials.get({
        mediation: "conditional",
        signal,
        publicKey: {
          challenge: crypto.getRandomValues(new Uint8Array(32)),
          userVerification: "required",
          extensions: { prf: { eval: { first: salt } } },
        },
      }),
    );
    if (!(assertion instanceof PublicKeyCredential)) return null;
    return copy(assertion.getClientExtensionResults().prf?.results?.first);
  }
}

/** A refused, cancelled or expired gesture returns `null`; any other WebAuthn refusal goes up to the caller. */
async function gesture<T>(call: () => Promise<T>): Promise<T | null> {
  try {
    return await call();
  } catch (e) {
    if (
      e instanceof DOMException &&
      (e.name === "NotAllowedError" || e.name === "AbortError")
    )
      return null;
    throw e;
  }
}

function copy(source: BufferSource | undefined): ArrayBuffer | null {
  if (!source) return null;
  const bytes =
    source instanceof ArrayBuffer
      ? new Uint8Array(source)
      : new Uint8Array(source.buffer, source.byteOffset, source.byteLength);
  return bytes.slice().buffer;
}
