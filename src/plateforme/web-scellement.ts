import type {
  Chiffreur,
  CoffreDeJetons,
  EcritureCoffre,
  EtatScellement,
  IssueDeverrouillage,
  IssueScellement,
  JetonsStockes,
  ScellementDesJetons,
} from "./ports";
import { CoffreDuNavigateur, toPaires } from "./web-coffre";

/**
 * Le scellé des jetons, et l'identifiant de la passkey qui l'ouvre. L'identifiant n'a rien de secret : il désigne la passkey, il n'en donne rien. Il survit à l'effacement des jetons, pour que le scellement suivant reprenne la même passkey plutôt que d'en ajouter une au trousseau.
 */
const CLE_SCELLE = "skanon.jetons-scelles";
const CLE_PASSKEY = "skanon.passkey";

/** Ce qu'on demande à la passkey de chiffrer par son secret (PRF) : une valeur fixe, que rien n'oblige à taire. La changer rendrait chaque scellé illisible. */
const SEL = new TextEncoder().encode("skanon:coffre:v1");

/** Deux clés tirées de la même sortie, une par usage : ce qui chiffre les jetons ne chiffre pas les contenus. */
const USAGE_JETONS = new TextEncoder().encode("skanon:jetons");
const USAGE_CONTENUS = new TextEncoder().encode("skanon:contenus");

/** Une passkey tout juste créée. `prf` : la sortie, quand le navigateur la rend dès la création ; `prfActif` faux : cette passkey ne sait pas en rendre. */
export interface PasskeyCreee {
  readonly id: Uint8Array<ArrayBuffer>;
  readonly prf: ArrayBuffer | null;
  readonly prfActif: boolean;
}

/**
 * Ce que le coffre demande à WebAuthn, isolé pour que les tests le doublent : jsdom n'en a pas. Chaque appel sollicite l'utilisateur.
 */
export interface Authentificateur {
  isPossible(): Promise<boolean>;
  /** Crée une passkey pour ce site ; `null` si l'utilisateur annule. */
  create(sel: Uint8Array<ArrayBuffer>): Promise<PasskeyCreee | null>;
  /** La sortie de cette passkey pour ce sel ; `null` si l'utilisateur annule ou qu'elle n'est plus dans le trousseau. */
  evaluate(
    id: Uint8Array<ArrayBuffer>,
    sel: Uint8Array<ArrayBuffer>,
  ): Promise<ArrayBuffer | null>;
}

interface Cles {
  readonly jetons: CryptoKey;
  readonly contenus: CryptoKey;
}

/**
 * Le coffre de la version web, qui sait sceller les jetons par une passkey (RG-secret-conserve-localement, 2026-055).
 *
 * Tant que rien n'est scellé, il garde les jetons en clair, comme `CoffreDuNavigateur`. Scellés, il ne garde que leur chiffré, et la clé n'existe qu'en mémoire, après un geste de l'utilisateur : elle vient de la passkey, qui ne la rend qu'à ce site et qu'après Touch ID ou le code de l'appareil. Un programme qui lit le profil du navigateur ne trouve donc qu'un chiffré. Un script sur la page, elle ouverte, lit les jetons comme l'application : la protection porte sur le repos, non sur la page.
 */
export class CoffreScelleDuNavigateur
  implements CoffreDeJetons, ScellementDesJetons
{
  private readonly clair = new CoffreDuNavigateur();
  private cles: Cles | null = null;

  constructor(private readonly auth: Authentificateur) {}

  get etat(): EtatScellement {
    if (this.cles) return "ouvert";
    return lire(CLE_SCELLE) ? "verrouille" : "aucun";
  }

  isPossible(): Promise<boolean> {
    return this.auth.isPossible();
  }

  /** Scellés et fermés, les jetons ne se lisent pas : rien n'est rendu, et `etat` dit pourquoi. */
  async loadJetons(): Promise<JetonsStockes> {
    if (!lire(CLE_SCELLE)) return this.clair.loadJetons();
    if (!this.cles) return AUCUN;
    return (await this.ouvrir(this.cles)) ?? AUCUN;
  }

  async saveJetons(jetons: JetonsStockes): Promise<EcritureCoffre> {
    // Écrire en clair à côté du scellé défairait la protection ; l'écraser sans la clé perdrait les jetons scellés.
    if (!this.cles) {
      if (lire(CLE_SCELLE)) return "refusee";
      return this.clair.saveJetons(jetons);
    }
    return this.ecrireScelle(this.cles, jetons);
  }

  async deleteJetons(): Promise<EcritureCoffre> {
    this.cles = null;
    const scelle = effacer(CLE_SCELLE);
    const clair = await this.clair.deleteJetons();
    return scelle && clair === "faite" ? "faite" : "refusee";
  }

  async sealJetons(jetons: JetonsStockes): Promise<IssueScellement> {
    let sortie: ArrayBuffer | "impossible" | null;
    try {
      sortie = await this.sortieDeLaPasskey();
    } catch {
      // Ce que WebAuthn refuse autrement que par un geste — passkey non prise en charge, contexte non sûr — ne se réessaie pas.
      return "impossible";
    }
    if (sortie === null) return "annule";
    if (sortie === "impossible") return "impossible";
    const cles = await deriverCles(sortie);
    if ((await this.ecrireScelle(cles, jetons)) === "refusee")
      return "impossible";
    return "scelle";
  }

  async unlockJetons(): Promise<IssueDeverrouillage> {
    const id = lireId();
    if (!lire(CLE_SCELLE) || !id) return { issue: "illisible" };
    let sortie: ArrayBuffer | null;
    try {
      sortie = await this.auth.evaluate(id, SEL);
    } catch {
      return { issue: "annule" };
    }
    if (!sortie) return { issue: "annule" };
    const cles = await deriverCles(sortie);
    const jetons = await this.ouvrir(cles);
    if (!jetons) return { issue: "illisible" };
    this.cles = cles;
    return { issue: "ouvert", jetons };
  }

  findChiffreur(): Chiffreur | null {
    const cle = this.cles?.contenus;
    if (!cle) return null;
    return {
      seal: (texte) => sceller(cle, texte),
      open: (scelle) => desceller(cle, scelle),
    };
  }

  /**
   * La sortie de la passkey déjà inscrite, ou d'une passkey neuve.
   *
   * Le navigateur ne distingue pas, par discrétion, une passkey supprimée d'un refus de l'utilisateur : faute de sortie, on en crée une neuve. Un utilisateur qui a seulement refusé se voit proposer la création, qu'il peut refuser aussi.
   */
  private async sortieDeLaPasskey(): Promise<
    ArrayBuffer | "impossible" | null
  > {
    const connue = lireId();
    const sortie = connue ? await this.auth.evaluate(connue, SEL) : null;
    if (sortie) return sortie;

    const creee = await this.auth.create(SEL);
    if (!creee) return null;
    if (!creee.prfActif) return "impossible";
    if (!ecrire(CLE_PASSKEY, versBase64(creee.id))) return "impossible";
    // Certains navigateurs ne rendent la sortie qu'à l'authentification : un second geste la demande.
    return creee.prf ?? this.auth.evaluate(creee.id, SEL);
  }

  private async ecrireScelle(
    cles: Cles,
    jetons: JetonsStockes,
  ): Promise<EcritureCoffre> {
    const scelle = await sceller(cles.jetons, JSON.stringify(jetons));
    if (!ecrire(CLE_SCELLE, scelle)) return "refusee";
    this.cles = cles;
    // Le clair ne survit pas au scellé : le garder défairait la protection.
    await this.clair.deleteJetons();
    return "faite";
  }

  private async ouvrir(cles: Cles): Promise<JetonsStockes | null> {
    const scelle = lire(CLE_SCELLE);
    const texte = scelle ? await desceller(cles.jetons, scelle) : null;
    if (texte === null) return null;
    try {
      const brut = JSON.parse(texte) as {
        general?: unknown;
        parPortee?: unknown;
      };
      return {
        general: typeof brut.general === "string" ? brut.general : null,
        parPortee: toPaires(brut.parPortee),
      };
    } catch {
      return null;
    }
  }
}

const AUCUN: JetonsStockes = { general: null, parPortee: [] };

async function deriverCles(sortie: ArrayBuffer): Promise<Cles> {
  const base = await crypto.subtle.importKey("raw", sortie, "HKDF", false, [
    "deriveKey",
  ]);
  const deriver = (info: Uint8Array<ArrayBuffer>) =>
    crypto.subtle.deriveKey(
      { name: "HKDF", hash: "SHA-256", salt: new Uint8Array(), info },
      base,
      { name: "AES-GCM", length: 256 },
      // Non extractible : même ouverte, la clé ne se recopie pas hors de cette page.
      false,
      ["encrypt", "decrypt"],
    );
  return {
    jetons: await deriver(USAGE_JETONS),
    contenus: await deriver(USAGE_CONTENUS),
  };
}

/** `iv.chiffré`, en base64 : un vecteur neuf à chaque scellé, comme AES-GCM l'exige. */
async function sceller(cle: CryptoKey, texte: string): Promise<string> {
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const chiffre = await crypto.subtle.encrypt(
    { name: "AES-GCM", iv },
    cle,
    new TextEncoder().encode(texte),
  );
  return `${versBase64(iv)}.${versBase64(new Uint8Array(chiffre))}`;
}

async function desceller(
  cle: CryptoKey,
  scelle: string,
): Promise<string | null> {
  const [iv, chiffre] = scelle.split(".");
  try {
    const clair = await crypto.subtle.decrypt(
      { name: "AES-GCM", iv: depuisBase64(iv) },
      cle,
      depuisBase64(chiffre),
    );
    return new TextDecoder().decode(clair);
  } catch {
    // Une autre clé, un scellé abîmé : AES-GCM le refuse, et c'est le comportement voulu.
    return null;
  }
}

function versBase64(octets: Uint8Array): string {
  return btoa(String.fromCharCode(...octets));
}

/** Lève sur un texte qui n'est pas du base64 : `desceller` le reçoit d'un stockage qu'il ne maîtrise pas, et le rattrape. */
function depuisBase64(texte: string | undefined): Uint8Array<ArrayBuffer> {
  if (!texte) throw new Error("scellé incomplet");
  return Uint8Array.from(atob(texte), (c) => c.charCodeAt(0));
}

function lireId(): Uint8Array<ArrayBuffer> | null {
  const brut = lire(CLE_PASSKEY);
  if (!brut) return null;
  try {
    return depuisBase64(brut);
  } catch {
    return null;
  }
}

// Le stockage peut être bloqué : une lecture rend alors rien, une écriture refusée le dit.
function lire(cle: string): string | null {
  try {
    return localStorage.getItem(cle);
  } catch {
    return null;
  }
}

function ecrire(cle: string, valeur: string): boolean {
  try {
    localStorage.setItem(cle, valeur);
    return true;
  } catch {
    return false;
  }
}

function effacer(cle: string): boolean {
  try {
    localStorage.removeItem(cle);
    return true;
  } catch {
    return false;
  }
}

/**
 * WebAuthn, avec l'extension PRF. La passkey est liée au domaine qui sert l'application : déplacer l'hébergement la rendrait inutilisable, et le jeton se ressaisirait une fois (2026-055, « Ce qu'il faut éprouver »).
 */
export class AuthentificateurDuNavigateur implements Authentificateur {
  async isPossible(): Promise<boolean> {
    if (
      typeof PublicKeyCredential === "undefined" ||
      typeof navigator === "undefined" ||
      !navigator.credentials
    )
      return false;
    // Les navigateurs récents disent s'ils connaissent PRF ; les autres ne disent rien, et seul l'essai tranche.
    const capacites = await (
      PublicKeyCredential as unknown as {
        getClientCapabilities?: () => Promise<Record<string, boolean>>;
      }
    )
      .getClientCapabilities?.()
      .catch(() => null);
    return capacites?.["extension:prf"] !== false;
  }

  async create(sel: Uint8Array<ArrayBuffer>): Promise<PasskeyCreee | null> {
    const id = crypto.getRandomValues(new Uint8Array(16));
    const credential = await geste(() =>
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
          extensions: { prf: { eval: { first: sel } } },
        },
      }),
    );
    if (!(credential instanceof PublicKeyCredential)) return null;
    const prf = credential.getClientExtensionResults().prf;
    return {
      id: new Uint8Array(credential.rawId),
      prf: copier(prf?.results?.first),
      prfActif: prf?.enabled ?? !!prf?.results?.first,
    };
  }

  async evaluate(
    id: Uint8Array<ArrayBuffer>,
    sel: Uint8Array<ArrayBuffer>,
  ): Promise<ArrayBuffer | null> {
    const assertion = await geste(() =>
      navigator.credentials.get({
        publicKey: {
          // Aucun serveur ne vérifie cette réponse : le défi n'est là que parce que WebAuthn l'exige.
          challenge: crypto.getRandomValues(new Uint8Array(32)),
          allowCredentials: [{ type: "public-key", id }],
          userVerification: "required",
          extensions: { prf: { eval: { first: sel } } },
        },
      }),
    );
    if (!(assertion instanceof PublicKeyCredential)) return null;
    return copier(assertion.getClientExtensionResults().prf?.results?.first);
  }
}

/** Un geste refusé, annulé ou expiré rend `null` ; tout autre refus de WebAuthn remonte à l'appelant. */
async function geste<T>(appel: () => Promise<T>): Promise<T | null> {
  try {
    return await appel();
  } catch (e) {
    if (
      e instanceof DOMException &&
      (e.name === "NotAllowedError" || e.name === "AbortError")
    )
      return null;
    throw e;
  }
}

function copier(source: BufferSource | undefined): ArrayBuffer | null {
  if (!source) return null;
  const octets =
    source instanceof ArrayBuffer
      ? new Uint8Array(source)
      : new Uint8Array(source.buffer, source.byteOffset, source.byteLength);
  return octets.slice().buffer;
}
