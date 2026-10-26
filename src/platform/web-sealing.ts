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
}

interface Keys {
  readonly tokens: CryptoKey;
  readonly contents: CryptoKey;
}

/**
 * The web version's vault, which can seal tokens with a passkey (RG-secret-conserve-localement, 2026-055).
 *
 * As long as nothing is sealed, it keeps tokens in plain text, like `BrowserVault`. Sealed, it keeps only their ciphertext, and the key only exists in memory, after a user gesture: it comes from the passkey, which only returns it to this site and only after Touch ID or the device code. A program that reads the browser profile therefore finds only ciphertext. A script on the page, once open, reads the tokens as the application does: the protection covers data at rest, not the page.
 */
export class BrowserSealedVault implements TokenVault, TokenSealing {
  private readonly clair = new BrowserVault();
  private keys: Keys | null = null;

  constructor(private readonly auth: Authenticator) {}

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
    if (!output) return { issue: "annule" };
    const keys = await deriveKeys(output);
    const tokens = await this.open(keys);
    if (!tokens) return { issue: "illisible" };
    this.keys = keys;
    return { issue: "ouvert", tokens };
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
