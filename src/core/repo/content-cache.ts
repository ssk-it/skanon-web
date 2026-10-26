import { InjectionToken, inject } from "../injection";
import { signal } from "../signals";
import { TreeEntry, RepoRef } from "../github/github-client";
import { IdentityFile, IdentityVariant } from "./identity-names";
import type { Cipher } from "../../platform/ports";

/**
 * Ce qu'on sait d'une branche lue : son arborescence, et quand on l'a lue.
 *
 * C'est ce qui permet deux choses que les contenus seuls ne donnent pas :
 * redemander l'arborescence de façon conditionnelle, et afficher le dernier état
 * lu quand le dépôt ne répond plus (RG-dernier-etat-connu).
 */
export interface KnownState {
  /** Le commit que l'arborescence avait résolu. */
  readonly commit: string;
  /** L'étiquette rendue avec l'arborescence, pour la redemander sous condition. */
  readonly etag: string | null;
  /** Instant de la lecture, au format ISO. */
  readonly readAt: string;
  readonly entries: readonly TreeEntry[];
  readonly truncated: boolean;
  /** Lu par l'API faute d'être servi par le canal public : un dépôt privé. */
  readonly private: boolean;
}

/**
 * Le stockage du navigateur où vivent les contenus, s'il en a un.
 *
 * Fourni par injection pour que les tests en donnent un neuf à chaque cas, et
 * qu'un navigateur qui n'en a pas — ou le refuse — retombe sur la mémoire de
 * l'onglet plutôt que d'échouer.
 */
export const INDEXEDDB_FACTORY = new InjectionToken<IDBFactory | null>(
  "FABRIQUE_INDEXEDDB",
  {
    factory: () => (typeof indexedDB === "undefined" ? null : indexedDB),
  },
);

const DATABASE_NAME = "ssk-canon.cache";
const CONTENTS = "contenus";
const STATES = "etats";
const IDENTITIES = "identites";

interface StoredContent {
  readonly repoRef: string;
  readonly sha: string;
  readonly content: string;
  readonly private: boolean;
}

interface StoredState extends KnownState {
  readonly repoRef: string;
  readonly ref: string;
}

/** Un symbole lu, prêt à montrer. */
export interface KnownSymbol {
  /** Le fichier de `identite/` qui le porte. */
  readonly path: string;
  /** Son empreinte, quand l'API l'a donnée : ce qui évite de le relire. */
  readonly sha: string | null;
  /** L'image, en adresse `data:` — voir `IdentitesService`. */
  readonly source: string;
}

/**
 * Ce qu'on sait de l'identité d'un projet, et de quoi la redemander.
 *
 * Lue hors de toute arborescence — l'accueil n'en charge aucune —, elle ne se
 * range pas sous une empreinte de contenu : elle se redemande sous condition,
 * et se remplace en entier. Voir RG-lecture-identite.
 */
export interface KnownProjectIdentity {
  /** Lue sous un accès, ou par le canal non décompté. */
  readonly channel: "api" | "raw";
  /** L'étiquette de la racine du dépôt, pour la redemander sous condition. */
  readonly etag: string | null;
  /** L'empreinte du répertoire `identite/`, `null` s'il n'existe pas. */
  readonly directory: string | null;
  /** Ce que le répertoire contient, quand l'API l'a dit. */
  readonly files: readonly IdentityFile[] | null;
  /** Le symbole de chaque fond déjà demandé ; `null` quand il n'y en a pas. */
  readonly symbols: Partial<Record<IdentityVariant, KnownSymbol | null>>;
  readonly private: boolean;
}

interface StoredProjectIdentity extends KnownProjectIdentity {
  readonly repoRef: string;
}

/**
 * Une entrée privée rangée sous la clé de la passkey. Ce qui la désigne reste lisible — le dépôt, l'empreinte ou la branche —, parce que l'élagage et les effacements trient sur eux ; le reste n'est que le scellé.
 */
interface SealedEntry {
  readonly private: true;
  readonly sealed: string;
}

/**
 * Comment le poste garde ce qu'il a lu d'un dépôt privé : sous la même forme que le jeton qui l'a ouvert (RG-contenus-prives-au-repos). En clair ; ou, le jeton scellé par une passkey, sous la clé qu'elle rend — et rien tant qu'elle n'est pas ouverte.
 */
type Protection =
  | { readonly mode: "clair" }
  | { readonly mode: "verrouille" }
  | { readonly mode: "chiffre"; readonly cipher: Cipher };

const PLAIN: Protection = { mode: "clair" };

/**
 * Les contenus déjà lus, rangés sous l'empreinte que l'arborescence leur donne.
 *
 * Une empreinte désigne un contenu et un seul : ce qui est rangé sous elle ne
 * peut pas être périmé. La fraîcheur ne se joue donc pas ici mais dans
 * l'arborescence, relue à chaque chargement, qui dit quelles empreintes sont en
 * vigueur. Voir RG-contenus-par-empreinte.
 *
 * Deux niveaux : la mémoire de l'onglet, toujours, et le stockage du navigateur
 * quand l'appelant le permet. Ce qui n'est pas persisté — un dépôt privé lu sous
 * un accès temporaire — vit et meurt avec l'onglet, comme l'accès lui-même
 * (RG-contenus-prives-au-repos).
 *
 * Le cache est une copie dérivée, jamais une source : tout échec du stockage est
 * avalé, et ne coûte qu'un téléchargement de plus.
 */
export class ContentCache {
  private readonly factory = inject(INDEXEDDB_FACTORY);
  private base: Promise<IDBDatabase | null> | null = null;

  private readonly contents = new Map<string, StoredContent>();
  private readonly states = new Map<string, StoredState>();
  private readonly identities = new Map<string, StoredProjectIdentity>();

  private protection: Protection = PLAIN;

  /** Range désormais ce qu'il lit d'un dépôt privé sous cette clé ; en clair, sans clé. */
  encryptWith(cipher: Cipher | null): void {
    this.protection = cipher ? { mode: "chiffre", cipher } : PLAIN;
  }

  /** Les jetons sont scellés et fermés : ce qui est lu d'un dépôt privé ne vit que dans l'onglet, et les scellés ne se rendent pas. */
  lock(): void {
    this.protection = { mode: "verrouille" };
  }

  /**
   * Augmente à chaque effacement achevé.
   *
   * Ce qu'un écran montre d'un dépôt privé doit disparaître avec l'accès, et
   * non au prochain chargement : c'est le signal que les vues suivent.
   */
  readonly erasures = signal(0);

  async loadContent(repoRef: RepoRef, sha: string): Promise<string | null> {
    const key = contentKey(repoRef, sha);
    const memory = this.contents.get(key);
    if (memory) return memory.content;

    const stored = await this.unseal<StoredContent>(
      await this.read(CONTENTS, [repoKey(repoRef), sha]),
    );
    if (!stored) return null;
    this.contents.set(key, stored);
    return stored.content;
  }

  async saveContent(
    repoRef: RepoRef,
    sha: string,
    content: string,
    options: { private: boolean; persist: boolean },
  ): Promise<void> {
    const entry: StoredContent = {
      repoRef: repoKey(repoRef),
      sha,
      content,
      private: options.private,
    };
    this.contents.set(contentKey(repoRef, sha), entry);
    if (options.persist)
      await this.writeProtected(CONTENTS, entry, {
        repoRef: entry.repoRef,
        sha,
      });
  }

  async loadState(repoRef: RepoRef, ref: string): Promise<KnownState | null> {
    const key = stateKey(repoRef, ref);
    const memory = this.states.get(key);
    if (memory) return memory;

    const stored = await this.unseal<StoredState>(
      await this.read(STATES, [repoKey(repoRef), ref]),
    );
    if (!stored) return null;
    this.states.set(key, stored);
    return stored;
  }

  async saveState(
    repoRef: RepoRef,
    ref: string,
    state: KnownState,
    options: { persist: boolean },
  ): Promise<void> {
    const entry: StoredState = { ...state, repoRef: repoKey(repoRef), ref };
    this.states.set(stateKey(repoRef, ref), entry);
    if (options.persist)
      await this.writeProtected(STATES, entry, { repoRef: entry.repoRef, ref });
  }

  async loadIdentity(repoRef: RepoRef): Promise<KnownProjectIdentity | null> {
    const key = repoKey(repoRef);
    const memory = this.identities.get(key);
    if (memory) return memory;

    const stored = await this.unseal<StoredProjectIdentity>(
      await this.read(IDENTITIES, key),
    );
    if (!stored) return null;
    this.identities.set(key, stored);
    return stored;
  }

  async saveIdentity(
    repoRef: RepoRef,
    identity: KnownProjectIdentity,
    options: { persist: boolean },
  ): Promise<void> {
    const entry: StoredProjectIdentity = {
      ...identity,
      repoRef: repoKey(repoRef),
    };
    this.identities.set(entry.repoRef, entry);
    if (options.persist)
      await this.writeProtected(IDENTITIES, entry, { repoRef: entry.repoRef });
  }

  /** Oublie l'identité d'un dépôt — refusée, ou disparue. */
  async clearIdentity(repoRef: RepoRef): Promise<void> {
    const key = repoKey(repoRef);
    this.identities.delete(key);
    await this.erase(IDENTITIES, key);
    this.erasures.update((n) => n + 1);
  }

  /**
   * Retire d'un dépôt ce qu'aucune arborescence lue ne cite plus.
   *
   * `empreintes` réunit celles de la branche principale et des branches de
   * cadrage ; `refs` les branches encore ouvertes. Le cache suit ainsi le
   * référentiel, non son historique.
   */
  async pruneRepo(
    repoRef: RepoRef,
    fingerprints: ReadonlySet<string>,
    refs: ReadonlySet<string>,
  ): Promise<void> {
    const key = repoKey(repoRef);
    this.forgetInMemory(
      (c) => c.repoRef === key && !fingerprints.has(c.sha),
      (e) => e.repoRef === key && !refs.has(e.ref),
      () => false,
    );
    await this.delete(
      (c: StoredContent) => c.repoRef === key && !fingerprints.has(c.sha),
      (e: StoredState) => e.repoRef === key && !refs.has(e.ref),
      () => false,
    );
  }

  /** Efface tout ce qu'on détient d'un dépôt. */
  async clearRepo(repoRef: RepoRef): Promise<void> {
    const key = repoKey(repoRef);
    this.forgetInMemory(
      (c) => c.repoRef === key,
      (e) => e.repoRef === key,
      (i) => i.repoRef === key,
    );
    await this.delete(
      (c: StoredContent) => c.repoRef === key,
      (e: StoredState) => e.repoRef === key,
      (i: StoredProjectIdentity) => i.repoRef === key,
    );
    this.erasures.update((n) => n + 1);
  }

  /**
   * Efface les contenus privés des dépôts qu'un accès retiré couvrait.
   *
   * Sans portée, tous : c'est le cas de la déconnexion.
   */
  async clearPrivate(
    covers: (repoRef: string) => boolean = () => true,
  ): Promise<void> {
    const privateRepos = new Set<string>();
    for (const c of this.contents.values())
      if (c.private && covers(c.repoRef)) privateRepos.add(c.repoRef);
    for (const e of this.states.values())
      if (e.private && covers(e.repoRef)) privateRepos.add(e.repoRef);
    for (const i of this.identities.values())
      if (i.private && covers(i.repoRef)) privateRepos.add(i.repoRef);

    this.forgetInMemory(
      (c) => privateRepos.has(c.repoRef),
      (e) => privateRepos.has(e.repoRef),
      (i) => privateRepos.has(i.repoRef),
    );
    await this.delete(
      (c: StoredContent) => c.private && covers(c.repoRef),
      (e: StoredState) => e.private && covers(e.repoRef),
      (i: StoredProjectIdentity) => i.private && covers(i.repoRef),
    );
    this.erasures.update((n) => n + 1);
  }

  private forgetInMemory(
    content: (c: StoredContent) => boolean,
    state: (e: StoredState) => boolean,
    identity: (i: StoredProjectIdentity) => boolean,
  ): void {
    for (const [key, c] of this.contents)
      if (content(c)) this.contents.delete(key);
    for (const [key, e] of this.states) if (state(e)) this.states.delete(key);
    for (const [key, i] of this.identities)
      if (identity(i)) this.identities.delete(key);
  }

  // --- protection des contenus privés ---

  /** Écrit une entrée telle que la protection le veut : elle-même, son scellé, ou rien. */
  private async writeProtected(
    store: string,
    entry: { readonly private: boolean },
    designation: Record<string, string>,
  ): Promise<void> {
    if (!entry.private || this.protection.mode === "clair")
      return this.write(store, entry);
    if (this.protection.mode === "verrouille") return;
    const sealedEntry: SealedEntry = {
      private: true,
      sealed: await this.protection.cipher.seal(JSON.stringify(entry)),
    };
    await this.write(store, { ...designation, ...sealedEntry });
  }

  /** Une entrée lue du stockage, rendue en clair ; `null` pour un scellé qu'aucune clé ouverte n'ouvre. */
  private async unseal<T>(stored: unknown): Promise<T | null> {
    if (!stored) return null;
    const sealed = (stored as Partial<SealedEntry>).sealed;
    if (sealed === undefined) return stored as T;
    if (this.protection.mode !== "chiffre") return null;
    const text = await this.protection.cipher.open(sealed);
    if (text === null) return null;
    try {
      return JSON.parse(text) as T;
    } catch {
      return null;
    }
  }

  // --- stockage du navigateur ---

  private open(): Promise<IDBDatabase | null> {
    this.base ??= new Promise((resolve) => {
      if (!this.factory) return resolve(null);
      try {
        // Version 3 : les champs des enregistrements ont pris leurs noms anglais (`repoRef`, `content`, `private`…). Ceux d'une version antérieure ne se relisent plus : un cache se reconstruit, ses magasins repartent vides.
        const request = this.factory.open(DATABASE_NAME, 3);
        request.onupgradeneeded = () => {
          const db = request.result;
          for (const name of [...db.objectStoreNames])
            db.deleteObjectStore(name);
          db.createObjectStore(CONTENTS, { keyPath: ["repoRef", "sha"] });
          db.createObjectStore(STATES, { keyPath: ["repoRef", "ref"] });
          db.createObjectStore(IDENTITIES, { keyPath: "repoRef" });
        };
        request.onsuccess = () => resolve(request.result);
        // Stockage refusé, quota dépassé, navigation privée stricte : l'onglet
        // garde sa mémoire, et le chargement suivant relira simplement tout.
        request.onerror = () => resolve(null);
        request.onblocked = () => resolve(null);
      } catch {
        resolve(null);
      }
    });
    return this.base;
  }

  private async read<T>(store: string, key: IDBValidKey): Promise<T | null> {
    const db = await this.open();
    if (!db) return null;
    try {
      return await new Promise<T | null>((resolve) => {
        const request = db.transaction(store).objectStore(store).get(key);
        request.onsuccess = () =>
          resolve((request.result as T | undefined) ?? null);
        request.onerror = () => resolve(null);
      });
    } catch {
      return null;
    }
  }

  private async write(store: string, value: unknown): Promise<void> {
    const db = await this.open();
    if (!db) return;
    try {
      await new Promise<void>((resolve) => {
        const tx = db.transaction(store, "readwrite");
        tx.objectStore(store).put(value);
        tx.oncomplete = () => resolve();
        tx.onerror = () => resolve();
        tx.onabort = () => resolve();
      });
    } catch {
      // stockage plein ou refusé : la mémoire de l'onglet suffit
    }
  }

  private async erase(store: string, key: IDBValidKey): Promise<void> {
    const db = await this.open();
    if (!db) return;
    try {
      await new Promise<void>((resolve) => {
        const tx = db.transaction(store, "readwrite");
        tx.objectStore(store).delete(key);
        tx.oncomplete = () => resolve();
        tx.onerror = () => resolve();
        tx.onabort = () => resolve();
      });
    } catch {
      // un effacement manqué se rattrape au suivant
    }
  }

  private async delete(
    content: (c: StoredContent) => boolean,
    state: (e: StoredState) => boolean,
    identity: (i: StoredProjectIdentity) => boolean,
  ): Promise<void> {
    const db = await this.open();
    if (!db) return;
    try {
      await new Promise<void>((resolve) => {
        const tx = db.transaction([CONTENTS, STATES, IDENTITIES], "readwrite");
        walk(tx.objectStore(CONTENTS), content);
        walk(tx.objectStore(STATES), state);
        walk(tx.objectStore(IDENTITIES), identity);
        tx.oncomplete = () => resolve();
        tx.onerror = () => resolve();
        tx.onabort = () => resolve();
      });
    } catch {
      // un effacement manqué se rattrape au suivant
    }
  }
}

function walk<T>(
  store: IDBObjectStore,
  shouldRemove: (value: T) => boolean,
): void {
  const cursor = store.openCursor();
  cursor.onsuccess = () => {
    const c = cursor.result;
    if (!c) return;
    if (shouldRemove(c.value as T)) c.delete();
    c.continue();
  };
}

/** `organisation/depot`, en minuscules : la forme des portées de jetons. */
function repoKey(repoRef: RepoRef): string {
  return `${repoRef.owner.toLowerCase()}/${repoRef.repo.toLowerCase()}`;
}

function contentKey(repoRef: RepoRef, sha: string): string {
  return `${repoKey(repoRef)}|${sha}`;
}

function stateKey(repoRef: RepoRef, ref: string): string {
  return `${repoKey(repoRef)}|${ref}`;
}
