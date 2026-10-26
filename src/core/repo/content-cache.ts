import { InjectionToken, inject } from "../injection";
import { signal } from "../signals";
import { TreeEntry, RepoRef } from "../github/github-client";
import { IdentityFile, IdentityVariant } from "./identity-names";
import type { Cipher } from "../../platform/ports";

/**
 * What is known of a read branch: its tree, and when it was read.
 *
 * That is what allows two things contents alone do not give:
 * requesting the tree again conditionally, and showing the last state
 * read when the repo no longer answers (RG-dernier-etat-connu).
 */
export interface KnownState {
  /** The commit the tree had resolved. */
  readonly commit: string;
  /** The tag returned with the tree, to request it again conditionally. */
  readonly etag: string | null;
  /** Time of the read, in ISO format. */
  readonly readAt: string;
  readonly entries: readonly TreeEntry[];
  readonly truncated: boolean;
  /** Read through the API for lack of being served by the public channel: a private repo. */
  readonly private: boolean;
}

/**
 * The browser storage where contents live, if it has one.
 *
 * Provided by injection so that tests give a fresh one to each case, and
 * so that a browser that has none — or refuses it — falls back on the tab's
 * memory rather than failing.
 */
export const INDEXEDDB_FACTORY = new InjectionToken<IDBFactory | null>(
  "FABRIQUE_INDEXEDDB",
  {
    factory: () => (typeof indexedDB === "undefined" ? null : indexedDB),
  },
);

const DATABASE_NAME = "ssk-canon.cache";
/** How long a tab waits for its storage before doing without: an opening that is answered at all is answered well within it. */
const OPEN_PATIENCE_MS = 2000;
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

/** A read symbol, ready to show. */
export interface KnownSymbol {
  /** The `identite/` file that carries it. */
  readonly path: string;
  /** Its fingerprint, when the API gave it: what avoids reading it again. */
  readonly sha: string | null;
  /** The image, as a `data:` address — see `ProjectIdentityService`. */
  readonly source: string;
}

/** The identity directory's declared name, and the configuration that says it. */
export interface DeclaredIdentityDirectory {
  readonly sha: string;
  readonly directory: string;
}

/**
 * What is known of a project's identity, and what to request it again with.
 *
 * Read outside any tree — the home page loads none —, it is not
 * stored under a content fingerprint: it is requested again conditionally,
 * and replaced as a whole. See RG-lecture-identite.
 */
export interface KnownProjectIdentity {
  /** Read under an access, or through the uncounted channel. */
  readonly channel: "api" | "raw";
  /** The tag of the repo root, to request it again conditionally. */
  readonly etag: string | null;
  /** The fingerprint of the `identite/` directory, `null` if it does not exist. */
  readonly directory: string | null;
  /** What the directory contains, when the API said so. */
  readonly files: readonly IdentityFile[] | null;
  /**
   * The configuration read to find the directory's declared name, by its
   * fingerprint — RG-noms-declares. Absent when it was not needed.
   */
  readonly config?: DeclaredIdentityDirectory | null;
  /** The symbol of each background already requested; `null` when there is none. */
  readonly symbols: Partial<Record<IdentityVariant, KnownSymbol | null>>;
  readonly private: boolean;
}

interface StoredProjectIdentity extends KnownProjectIdentity {
  readonly repoRef: string;
}

/**
 * A private entry stored under the passkey's key. What designates it stays readable — the repo, the fingerprint or the branch —, because pruning and erasures sort on them; the rest is only the seal.
 */
interface SealedEntry {
  readonly private: true;
  readonly sealed: string;
}

/**
 * How the machine keeps what it read from a private repo: in the same form as the token that opened it (RG-contenus-prives-au-repos). In clear; or, the token sealed by a passkey, under the key it returns — and nothing while it is not open.
 */
type Protection =
  | { readonly mode: "clair" }
  | { readonly mode: "verrouille" }
  | { readonly mode: "chiffre"; readonly cipher: Cipher };

const PLAIN: Protection = { mode: "clair" };

/**
 * Contents already read, stored under the fingerprint the tree gives them.
 *
 * A fingerprint designates one content and only one: what is stored under it
 * cannot be stale. Freshness is therefore not decided here but in
 * the tree, re-read at each load, which says which fingerprints are
 * current. See RG-contenus-par-empreinte.
 *
 * Two levels: the tab's memory, always, and the browser storage
 * when the caller allows it. What is not persisted — a private repo read under
 * a temporary access — lives and dies with the tab, like the access itself
 * (RG-contenus-prives-au-repos).
 *
 * The cache is a derived copy, never a source: any storage failure is
 * swallowed, and costs only one more download.
 */
export class ContentCache {
  private readonly factory = inject(INDEXEDDB_FACTORY);
  private base: Promise<IDBDatabase | null> | null = null;

  private readonly contents = new Map<string, StoredContent>();
  private readonly states = new Map<string, StoredState>();
  private readonly identities = new Map<string, StoredProjectIdentity>();

  private protection: Protection = PLAIN;

  /** From now on stores what it reads from a private repo under this key; in clear, without a key. */
  encryptWith(cipher: Cipher | null): void {
    this.protection = cipher ? { mode: "chiffre", cipher } : PLAIN;
  }

  /** Tokens are sealed and closed: what is read from a private repo only lives in the tab, and seals are not given back. */
  lock(): void {
    this.protection = { mode: "verrouille" };
  }

  /**
   * Increases at each completed erasure.
   *
   * What a screen shows of a private repo must disappear with the access, and
   * not at the next load: this is the signal views follow.
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

  /** Forgets a repo's identity — refused, or gone. */
  async clearIdentity(repoRef: RepoRef): Promise<void> {
    const key = repoKey(repoRef);
    this.identities.delete(key);
    await this.erase(IDENTITIES, key);
    this.erasures.update((n) => n + 1);
  }

  /**
   * Removes from a repo what no read tree cites any more.
   *
   * `fingerprints` gathers those of the default branch and of the scoping
   * branches; `refs` the branches still open. The cache thus follows the
   * specification, not its history.
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

  /** Erases everything held about a repo. */
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
   * Erases the private contents of the repos a removed access covered.
   *
   * Without a scope, all of them: that is the sign-out case.
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

  // --- protection of private contents ---

  /** Writes an entry as the protection wants it: itself, its seal, or nothing. */
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

  /** An entry read from storage, returned in clear; `null` for a seal no open key opens. */
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

  // --- browser storage ---

  private open(): Promise<IDBDatabase | null> {
    this.base ??= new Promise((answer) => {
      if (!this.factory) return answer(null);
      // An opening queued behind an upgrade that another tab blocks receives no event at all, for as long as that tab stays open: past this delay, the tab does without storage rather than waiting on it.
      let settled = false;
      const resolve = (db: IDBDatabase | null): void => {
        if (settled) {
          // Given up on, then obtained: closed, so as to hold nothing that a later version would wait for.
          db?.close();
          return;
        }
        settled = true;
        clearTimeout(patience);
        if (db) {
          // A later version, opened in another tab, asks for the database: let it go.
          db.onversionchange = () => db.close();
        }
        answer(db);
      };
      const patience = setTimeout(() => resolve(null), OPEN_PATIENCE_MS);
      try {
        // Version 3: record fields took their English names (`repoRef`, `content`, `private`…). Those of an earlier version can no longer be read back: a cache can be rebuilt, its stores start empty.
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
        // Storage refused, quota exceeded, strict private browsing: the tab
        // keeps its memory, and the next load will simply read everything again.
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
      // storage full or refused: the tab's memory is enough
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
      // a missed erasure is made up for by the next one
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
      // a missed erasure is made up for by the next one
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

/** `owner/repo`, in lower case: the form of token scopes. */
function repoKey(repoRef: RepoRef): string {
  return `${repoRef.owner.toLowerCase()}/${repoRef.repo.toLowerCase()}`;
}

function contentKey(repoRef: RepoRef, sha: string): string {
  return `${repoKey(repoRef)}|${sha}`;
}

function stateKey(repoRef: RepoRef, ref: string): string {
  return `${repoKey(repoRef)}|${ref}`;
}
