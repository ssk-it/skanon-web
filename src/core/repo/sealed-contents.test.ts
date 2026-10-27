import { beforeEach, describe, expect, it } from "vitest";
import { IDBFactory } from "fake-indexeddb";
import { inject, provide, resetInjection } from "../injection";
import type { Cipher } from "../../platform/ports";
import { ContentCache, KnownState, INDEXEDDB_FACTORY } from "./content-cache";

/**
 * A simulated cipher, reversible under its own key only: it is enough to test that the cache stores only sealed items, and that a sealed item opens only under the key that made it. The real encryption is tested with the vault (`web-sealing.test.ts`).
 */
function cipher(key: string): Cipher {
  return {
    seal: async (text) => `${key}:${btoa(encodeURIComponent(text))}`,
    open: async (sealed) =>
      sealed.startsWith(`${key}:`)
        ? decodeURIComponent(atob(sealed.slice(key.length + 1)))
        : null,
  };
}

/** Everything the browser's storage keeps, in one block, as a program opening the profile would read it. */
async function raw(factory: IDBFactory): Promise<string> {
  const db = await new Promise<IDBDatabase>((end) => {
    const d = factory.open("ssk-canon.cache");
    d.onsuccess = () => end(d.result);
  });
  const stores = [...db.objectStoreNames];
  const everything = await Promise.all(
    stores.map(
      (m) =>
        new Promise<unknown[]>((end) => {
          const d = db.transaction(m).objectStore(m).getAll();
          d.onsuccess = () => end(d.result as unknown[]);
        }),
    ),
  );
  db.close();
  return JSON.stringify(everything);
}

/**
 * RG-contenus-prives-au-repos: a private repo's contents are kept in the same form as the token that opens them. Sealed, the token; sealed, the contents.
 */
describe("private contents under the passkey's key", () => {
  const PRIVATE = { owner: "org", repo: "prive" };
  const PUBLIC = { owner: "org", repo: "public" };
  let factory: IDBFactory;

  function newVisit(): ContentCache {
    resetInjection();
    provide(INDEXEDDB_FACTORY, factory);
    return inject(ContentCache);
  }

  function state(): KnownState {
    return {
      commit: "c0mm17",
      etag: '"e1"',
      readAt: "2026-10-05T08:00:00.000Z",
      entries: [{ path: "rules/RG-secrete.md", sha: "a1", type: "blob" }],
      truncated: false,
      private: true,
    };
  }

  beforeEach(() => {
    factory = new IDBFactory();
  });

  it("stores only sealed items from a private repo", async () => {
    const cache = newVisit();
    cache.encryptWith(cipher("k1"));
    await cache.saveContent(PRIVATE, "a1", "énoncé confidentiel", {
      private: true,
    });
    await cache.saveState(PRIVATE, "HEAD", state());
    const stored = await raw(factory);
    expect(stored).not.toContain("confidentiel");
    expect(stored).not.toContain("RG-secrete");
  });

  it("reopens them on the next visit, under the same key", async () => {
    const cache = newVisit();
    cache.encryptWith(cipher("k1"));
    await cache.saveContent(PRIVATE, "a1", "énoncé confidentiel", {
      private: true,
    });
    await cache.saveState(PRIVATE, "HEAD", state());

    const next = newVisit();
    next.encryptWith(cipher("k1"));
    expect(await next.loadContent(PRIVATE, "a1")).toBe("énoncé confidentiel");
    expect(await next.loadState(PRIVATE, "HEAD")).toMatchObject(state());
  });

  it("does not return them while tokens are locked", async () => {
    const cache = newVisit();
    cache.encryptWith(cipher("k1"));
    await cache.saveContent(PRIVATE, "a1", "énoncé confidentiel", {
      private: true,
    });

    const next = newVisit();
    next.lock();
    expect(await next.loadContent(PRIVATE, "a1")).toBeNull();
  });

  it("stores nothing from a private repo while tokens are locked", async () => {
    // neither in clear, which would undo the protection, nor sealed, for lack of a key
    const cache = newVisit();
    cache.lock();
    await cache.saveContent(PRIVATE, "a1", "énoncé confidentiel", {
      private: true,
    });
    expect(await raw(factory)).not.toContain("confidentiel");
    expect(await cache.loadContent(PRIVATE, "a1")).toBe("énoncé confidentiel");
  });

  it("does not return a sealed item another key made", async () => {
    const cache = newVisit();
    cache.encryptWith(cipher("k1"));
    await cache.saveContent(PRIVATE, "a1", "énoncé confidentiel", {
      private: true,
    });
    const next = newVisit();
    next.encryptWith(cipher("k2"));
    expect(await next.loadContent(PRIVATE, "a1")).toBeNull();
  });

  it("keeps in clear what it reads from a public repo", async () => {
    // nothing to protect: the public channel serves it to anyone
    const cache = newVisit();
    cache.encryptWith(cipher("k1"));
    await cache.saveContent(PUBLIC, "b2", "énoncé public", {
      private: false,
    });
    expect(await raw(factory)).toContain("énoncé public");
    expect(await newVisit().loadContent(PUBLIC, "b2")).toBe("énoncé public");
  });

  it("erases a private repo's sealed items with the other private contents", async () => {
    const cache = newVisit();
    cache.encryptWith(cipher("k1"));
    await cache.saveContent(PRIVATE, "a1", "énoncé confidentiel", {
      private: true,
    });
    await cache.clearPrivate();
    const next = newVisit();
    next.encryptWith(cipher("k1"));
    expect(await next.loadContent(PRIVATE, "a1")).toBeNull();
  });

  it("goes back to clear when the key is withdrawn from it", async () => {
    const cache = newVisit();
    cache.encryptWith(cipher("k1"));
    cache.encryptWith(null);
    await cache.saveContent(PRIVATE, "a1", "énoncé confidentiel", {
      private: true,
    });
    expect(await raw(factory)).toContain("confidentiel");
  });
});
