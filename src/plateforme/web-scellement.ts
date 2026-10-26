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
import { BrowserVault, toPairs } from "./web-coffre";

/**
 * Le scellé des jetons, et l'identifiant de la passkey qui l'ouvre. L'identifiant n'a rien de secret : il désigne la passkey, il n'en donne rien. Il survit à l'effacement des jetons, pour que le scellement suivant reprenne la même passkey plutôt que d'en ajouter une au trousseau.
 */
const SEALED_KEY = "skanon.jetons-scelles";
const PASSKEY_KEY = "skanon.passkey";

/** Ce qu'on demande à la passkey de chiffrer par son secret (PRF) : une valeur fixe, que rien n'oblige à taire. La changer rendrait chaque scellé illisible. */
const SALT = new TextEncoder().encode("skanon:coffre:v1");

/** Deux clés tirées de la même sortie, une par usage : ce qui chiffre les jetons ne chiffre pas les contenus. */
const TOKENS_USAGE = new TextEncoder().encode("skanon:jetons");
const CONTENTS_USAGE = new TextEncoder().encode("skanon:contenus");

/** Une passkey tout juste créée. `prf` : la sortie, quand le navigateur la rend dès la création ; `prfActif` faux : cette passkey ne sait pas en rendre. */
export interface CreatedPasskey {
  readonly id: Uint8Array<ArrayBuffer>;
  readonly prf: ArrayBuffer | null;
  readonly prfEnabled: boolean;
}

/**
 * Ce que le coffre demande à WebAuthn, isolé pour que les tests le doublent : jsdom n'en a pas. Chaque appel sollicite l'utilisateur.
 */
export interface Authenticator {
  isPossible(): Promise<boolean>;
  /** Crée une passkey pour ce site ; `null` si l'utilisateur annule. */
  create(salt: Uint8Array<ArrayBuffer>): Promise<CreatedPasskey | null>;
  /** La sortie de cette passkey pour ce sel ; `null` si l'utilisateur annule ou qu'elle n'est plus dans le trousseau. */
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
 * Le coffre de la version web, qui sait sceller les jetons par une passkey (RG-secret-conserve-localement, 2026-055).
 *
 * Tant que rien n'est scellé, il garde les jetons en clair, comme `CoffreDuNavigateur`. Scellés, il ne garde que leur chiffré, et la clé n'existe qu'en mémoire, après un geste de l'utilisateur : elle vient de la passkey, qui ne la rend qu'à ce site et qu'après Touch ID ou le code de l'appareil. Un programme qui lit le profil du navigateur ne trouve donc qu'un chiffré. Un script sur la page, elle ouverte, lit les jetons comme l'application : la protection porte sur le repos, non sur la page.
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

  /** Scellés et fermés, les jetons ne se lisent pas : rien n'est rendu, et `etat` dit pourquoi. */
  async loadTokens(): Promise<StoredTokens> {
    if (!read(SEALED_KEY)) return this.clair.loadTokens();
    if (!this.keys) return NONE;
    return (await this.open(this.keys)) ?? NONE;
  }

  async saveTokens(tokens: StoredTokens): Promise<VaultWrite> {
    // Écrire en clair à côté du scellé défairait la protection ; l'écraser sans la clé perdrait les jetons scellés.
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
      // Ce que WebAuthn refuse autrement que par un geste — passkey non prise en charge, contexte non sûr — ne se réessaie pas.
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
   * La sortie de la passkey déjà inscrite, ou d'une passkey neuve.
   *
   * Le navigateur ne distingue pas, par discrétion, une passkey supprimée d'un refus de l'utilisateur : faute de sortie, on en crée une neuve. Un utilisateur qui a seulement refusé se voit proposer la création, qu'il peut refuser aussi.
   */
  private async passkeyOutput(): Promise<ArrayBuffer | "impossible" | null> {
    const known = readId();
    const output = known ? await this.auth.evaluate(known, SALT) : null;
    if (output) return output;

    const created = await this.auth.create(SALT);
    if (!created) return null;
    if (!created.prfEnabled) return "impossible";
    if (!write(PASSKEY_KEY, toBase64Url(created.id))) return "impossible";
    // Certains navigateurs ne rendent la sortie qu'à l'authentification : un second geste la demande.
    return created.prf ?? this.auth.evaluate(created.id, SALT);
  }

  private async writeSealed(
    keys: Keys,
    tokens: StoredTokens,
  ): Promise<VaultWrite> {
    const sealed = await seal(keys.tokens, writeSealedText(tokens));
    if (!write(SEALED_KEY, sealed)) return "refusee";
    this.keys = keys;
    // Le clair ne survit pas au scellé : le garder défairait la protection.
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
 * Le texte scellé est un format stocké sur le poste : ses champs gardent leurs noms d'origine, `general` et `parPortee`, quels que soient ceux du code. Les renommer ferait perdre ses jetons scellés à qui met à jour.
 */
export function writeSealedText(tokens: StoredTokens): string {
  return JSON.stringify({ general: tokens.general, parPortee: tokens.byScope });
}

/** Les jetons d'un texte scellé ; `null` s'il est illisible. */
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
      // Non extractible : même ouverte, la clé ne se recopie pas hors de cette page.
      false,
      ["encrypt", "decrypt"],
    );
  return {
    tokens: await derived(TOKENS_USAGE),
    contents: await derived(CONTENTS_USAGE),
  };
}

/** `iv.chiffré`, en base64 : un vecteur neuf à chaque scellé, comme AES-GCM l'exige. */
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
    // Une autre clé, un scellé abîmé : AES-GCM le refuse, et c'est le comportement voulu.
    return null;
  }
}

function toBase64Url(bytes: Uint8Array): string {
  return btoa(String.fromCharCode(...bytes));
}

/** Lève sur un texte qui n'est pas du base64 : `desceller` le reçoit d'un stockage qu'il ne maîtrise pas, et le rattrape. */
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

// Le stockage peut être bloqué : une lecture rend alors rien, une écriture refusée le dit.
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
 * WebAuthn, avec l'extension PRF. La passkey est liée au domaine qui sert l'application : déplacer l'hébergement la rendrait inutilisable, et le jeton se ressaisirait une fois (2026-055, « Ce qu'il faut éprouver »).
 */
export class BrowserAuthenticator implements Authenticator {
  async isPossible(): Promise<boolean> {
    if (
      typeof PublicKeyCredential === "undefined" ||
      typeof navigator === "undefined" ||
      !navigator.credentials
    )
      return false;
    // Les navigateurs récents disent s'ils connaissent PRF ; les autres ne disent rien, et seul l'essai tranche.
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
          // Aucun serveur ne vérifie cette réponse : le défi n'est là que parce que WebAuthn l'exige.
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

/** Un geste refusé, annulé ou expiré rend `null` ; tout autre refus de WebAuthn remonte à l'appelant. */
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
