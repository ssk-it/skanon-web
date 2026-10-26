/**
 * Ce que l'interface demande au système, et rien de plus. Chaque cible — l'application de bureau, la version web — fournit ses adaptateurs ; seul `src/plateforme.ts` les choisit (docs/pratiques.md, « La frontière avec le système »).
 */

/** Le jeton général, et les jetons par portée (RG-secret-conserve-localement). */
export interface StoredTokens {
  readonly general: string | null;
  readonly byScope: readonly (readonly [string, string])[];
}

/**
 * Ce qu'est devenue une écriture dans le coffre. Refusée, le secret vaut pour la session en mémoire, et l'interface le dit : il ne sera pas retrouvé au lancement suivant — ou, pour un effacement, il le sera (RG-secret-conserve-localement).
 */
export type VaultWrite = "faite" | "refusee";

/**
 * Où vivent les jetons d'accès. Aucune opération ne lève : un coffre indisponible laisse les jetons valoir pour la session en mémoire, il n'empêche pas l'application de démarrer.
 */
export interface TokenVault {
  /** Ce que le coffre garde ; rien si le coffre est vide ou illisible. */
  loadTokens(): Promise<StoredTokens>;
  saveTokens(tokens: StoredTokens): Promise<VaultWrite>;
  deleteTokens(): Promise<VaultWrite>;
}

/**
 * Où en sont des jetons scellés par une passkey : aucun scellé (le coffre les garde en clair, ou n'en garde pas), scellés mais fermés pour cette page, ou ouverts par un geste de l'utilisateur.
 */
export type SealingState = "aucun" | "verrouille" | "ouvert";

/** Ce qu'est devenue une demande de scellement. `impossible` : ce navigateur ou cet appareil ne rend pas de clé (PRF). */
export type SealingOutcome = "scelle" | "annule" | "impossible";

/**
 * Ce qu'a rendu un déverrouillage. `annule` couvre aussi la passkey introuvable : le navigateur ne distingue pas un refus de l'utilisateur d'une passkey supprimée, par discrétion. `illisible` : la clé rendue n'ouvre pas le chiffré.
 */
export type UnlockOutcome =
  | { readonly issue: "ouvert"; readonly tokens: StoredTokens }
  | { readonly issue: "annule" }
  | { readonly issue: "illisible" };

/** Chiffre un texte sous la clé de la passkey, pour ce que le poste garde d'un dépôt privé (RG-contenus-prives-au-repos). */
export interface Cipher {
  seal(text: string): Promise<string>;
  /** Le texte, ou `null` quand le scellé ne s'ouvre pas sous cette clé. */
  open(sealed: string): Promise<string | null>;
}

/**
 * Le scellement des jetons par une passkey, dans la version web (RG-secret-conserve-localement). La clé ne quitte jamais le trousseau de l'utilisateur, et ne s'obtient que par un geste : seul le chiffré reste dans le navigateur. Chaque appel qui sollicite la passkey doit partir d'un geste de l'utilisateur dans la page.
 *
 * L'application de bureau n'en a pas : le coffre du système garde déjà les jetons hors de la page.
 */
export interface TokenSealing {
  /** L'état depuis le dernier chargement, scellement ou déverrouillage. */
  readonly state: SealingState;
  /** Faux quand ce navigateur ne sait sûrement pas sceller ; vrai ne garantit rien, seul l'essai le dit. */
  isPossible(): Promise<boolean>;
  /** Scelle ces jetons, et efface ce que le coffre gardait en clair. */
  sealTokens(tokens: StoredTokens): Promise<SealingOutcome>;
  /** Ouvre les jetons scellés pour cette page. */
  unlockTokens(): Promise<UnlockOutcome>;
  /** Le chiffreur des contenus privés, tant que les jetons sont ouverts ; `null` sinon. */
  findCipher(): Cipher | null;
}

/** Ouvre une adresse hors de l'application, dans le navigateur de l'utilisateur. */
export interface ExternalOpener {
  open(url: string): Promise<void>;
}

/**
 * Les liens d'ouverture que le système remet à l'application (RG-ouverture-par-protocole). Le récepteur les rend entiers, schéma compris : c'est la route `/ouvrir` qui les valide, pour les deux cibles.
 */
export interface LinkReceiver {
  /** Le lien qui a lancé l'application, s'il y en a un, puis chaque lien reçu ensuite. */
  listen(onLink: (link: string) => void): Promise<void>;
}

/**
 * Ce qu'annonce celui qui livre l'application : une version plus récente, prête à servir, ou la version en cours qui n'est plus entièrement disponible (RG-nouvelle-version-proposee, RG-version-perdue-signalee).
 */
export type VersionAnnouncement = "prete" | "perdue";

/**
 * Pourquoi aucune version n'est annoncée. L'annonceur la nomme, et seul le livrable qui le connaît la formule (RG-message-nomme-la-cause) : l'interface commune la reçoit sans en connaître la liste. Le type est marqué pour qu'aucun texte de l'interface commune ne puisse en nommer une par mégarde.
 */
export type NoVersionCause = string & { readonly __noVersionCause: never };

/** La seule cause que l'interface commune constate elle-même : la version prête n'a pas pu s'installer. */
export const INSTALLATION_FAILED = "installation-echouee" as NoVersionCause;

/**
 * Ce qui annonce une version. La version web l'apprend de son service worker ; l'application de bureau, de son cœur natif.
 */
export interface VersionAnnouncer {
  /** Faux quand rien ne peut être annoncé : pas de service worker, serveur de développement. */
  readonly active: boolean;
  /** Vrai quand passer à la version prête relance l'application, plutôt que de recharger la page : sur le bureau. */
  readonly relaunches: boolean;
  /** Chaque annonce, à mesure qu'elle arrive ; rend de quoi cesser d'écouter. */
  listen(
    onAnnouncement: (announcement: VersionAnnouncement) => void,
  ): () => void;
  /** La cause de la dernière vérification restée sans version, `null` quand elle a abouti. La version web n'en annonce aucune : son service worker se tait. */
  listenCause(onCause: (cause: NoVersionCause | null) => void): () => void;
  /** Demande si une version plus récente est publiée ; la réponse arrive par `listen`. Peut échouer, hors ligne par exemple. */
  check(): Promise<void>;
  /** Fait servir la version prête : au prochain chargement sur le web, en relançant sur le bureau. Peut échouer. */
  activate(): Promise<void>;
}

export interface Platform {
  readonly target: "bureau" | "web";
  readonly vault: TokenVault;
  /** Le scellement des jetons par passkey ; `null` sur le bureau, où le coffre du système suffit. */
  readonly sealing: TokenSealing | null;
  readonly opener: ExternalOpener;
  readonly links: LinkReceiver;
  readonly version: VersionAnnouncer;
  /** La version que cette fenêtre exécute, telle que la barre du bas l'affiche : le numéro publié sur le bureau, le commit construit sur le web. */
  readonly loadVersion: () => Promise<string>;
}

/** Le schéma des liens d'ouverture : `skanon:ssk-it/ssk-canon/cadrages/2026-047`. */
export const DEEP_LINK_SCHEME = "skanon";
