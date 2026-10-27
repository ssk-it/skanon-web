import { inject, provide, resetInjection } from "../injection";
import { beforeEach, describe, expect, it } from "vitest";
import { IDBFactory } from "fake-indexeddb";
import { ContentCache, KnownState, INDEXEDDB_FACTORY } from "./content-cache";

/**
 * RG-contenus-par-empreinte, RG-contenus-prives-au-repos.
 *
 * Each case opens two instances on the same storage: the second plays the
 * next visit, which no longer has the tab's memory.
 */
describe("content cache", () => {
  const PUBLIC = { owner: "Org", repo: "Public" };
  const PRIVATE = { owner: "org", repo: "prive" };
  const ELSEWHERE = { owner: "autre", repo: "prive" };

  let factory: IDBFactory | null;

  function newVisit(): ContentCache {
    resetInjection();
    provide(INDEXEDDB_FACTORY, factory);
    return inject(ContentCache);
  }

  function state(isPrivate: boolean): KnownState {
    return {
      commit: "c0mm17",
      etag: '"e1"',
      readAt: "2026-10-05T08:00:00.000Z",
      entries: [{ path: "rules/RG-a.md", sha: "a1", type: "blob" }],
      truncated: false,
      private: isPrivate,
    };
  }

  beforeEach(() => {
    factory = new IDBFactory();
  });

  // Version 2 records carried fields with French names (`depot`, `contenu`, `prive`): read back under the new names, they would return missing fields. A cache can be rebuilt; start from scratch.
  it("starts from an empty cache on a machine that went through version 2", async () => {
    await new Promise<void>((resolve, reject) => {
      const request = factory!.open("ssk-canon.cache", 2);
      request.onupgradeneeded = () => {
        const db = request.result;
        db.createObjectStore("contenus", { keyPath: ["depot", "sha"] });
        db.createObjectStore("etats", { keyPath: ["depot", "ref"] });
        db.createObjectStore("identites", { keyPath: "depot" });
      };
      request.onsuccess = () => {
        const db = request.result;
        const tx = db.transaction("contenus", "readwrite");
        tx.objectStore("contenus").put({
          depot: "org/public",
          sha: "a1",
          contenu: "ancien",
          prive: false,
        });
        tx.oncomplete = () => {
          db.close();
          resolve();
        };
        tx.onerror = () => reject(tx.error);
      };
      request.onerror = () => reject(request.error);
    });

    const cache = newVisit();
    expect(await cache.loadContent(PUBLIC, "a1")).toBeNull();
    await cache.saveContent(PUBLIC, "a1", "un énoncé", {
      private: false,
    });
    expect(await newVisit().loadContent(PUBLIC, "a1")).toBe("un énoncé");
  });

  // A tab left open on version 2 holds the database and never lets it go: the upgrade to version 3 waits for it, and every opening after it waits behind, with no event at all. Loading a repo awaited it, and stayed on « Chargement du référentiel… ».
  it("answers without storage while a tab of an earlier version holds the database", async () => {
    await new Promise<void>((resolve, reject) => {
      const request = factory!.open("ssk-canon.cache", 2);
      request.onupgradeneeded = () =>
        request.result.createObjectStore("contenus", {
          keyPath: ["depot", "sha"],
        });
      // Kept open, without `onversionchange`: the code of version 2 never closed it.
      request.onsuccess = () => resolve();
      request.onerror = () => reject(request.error);
    });

    const first = newVisit();
    expect(await first.loadState(PUBLIC, "HEAD")).toBeNull();
    const second = newVisit();
    expect(await second.loadState(PUBLIC, "HEAD")).toBeNull();
    await second.saveContent(PUBLIC, "a1", "un énoncé", {
      private: false,
    });
    expect(await second.loadContent(PUBLIC, "a1")).toBe("un énoncé");
  });

  // The same trap, the other way round: an open tab of this version must not hold back the next one.
  it("lets a later version of the database open while a tab still uses it", async () => {
    const cache = newVisit();
    await cache.saveContent(PUBLIC, "a1", "un énoncé", {
      private: false,
    });

    const events = await new Promise<string[]>((resolve) => {
      const seen: string[] = [];
      const request = factory!.open("ssk-canon.cache", 4);
      request.onblocked = () => seen.push("blocked");
      request.onsuccess = () => {
        request.result.close();
        resolve([...seen, "success"]);
      };
      request.onerror = () => resolve([...seen, "error"]);
    });
    expect(events).toEqual(["success"]);
  });

  it("serves a content again on the next visit, under its fingerprint", async () => {
    await newVisit().saveContent(PUBLIC, "a1", "un énoncé", {
      private: false,
    });

    const next = newVisit();
    expect(await next.loadContent(PUBLIC, "a1")).toBe("un énoncé");
    expect(await next.loadContent(PUBLIC, "b2")).toBeNull();
  });

  it("does not confuse two repos, whatever the case of the name", async () => {
    const cache = newVisit();
    await cache.saveContent(PUBLIC, "a1", "public", {
      private: false,
    });

    expect(
      await newVisit().loadContent({ owner: "org", repo: "public" }, "a1"),
    ).toBe("public");
    expect(await newVisit().loadContent(PRIVATE, "a1")).toBeNull();
  });

  it("keeps the last read state of each branch", async () => {
    await newVisit().saveState(PUBLIC, "HEAD", state(false));

    const reread = await newVisit().loadState(PUBLIC, "HEAD");
    expect(reread?.commit).toBe("c0mm17");
    expect(reread?.entries).toEqual(state(false).entries);
    expect(await newVisit().loadState(PUBLIC, "cadrage-2026-001")).toBeNull();
  });

  it("removes what no read tree cites any more, and closed branches", async () => {
    const cache = newVisit();
    for (const sha of ["a1", "b2", "c3"]) {
      await cache.saveContent(PUBLIC, sha, sha, {
        private: false,
      });
    }
    await cache.saveContent(PRIVATE, "c3", "autre dépôt", {
      private: true,
    });
    await cache.saveState(PUBLIC, "HEAD", state(false));
    await cache.saveState(PUBLIC, "cadrage-2026-001", state(false));

    await cache.pruneRepo(PUBLIC, new Set(["a1", "b2"]), new Set(["HEAD"]));

    for (const visit of [cache, newVisit()]) {
      expect(await visit.loadContent(PUBLIC, "a1")).toBe("a1");
      expect(await visit.loadContent(PUBLIC, "c3")).toBeNull();
      expect(await visit.loadContent(PRIVATE, "c3")).toBe("autre dépôt");
      expect(await visit.loadState(PUBLIC, "HEAD")).not.toBeNull();
      expect(await visit.loadState(PUBLIC, "cadrage-2026-001")).toBeNull();
    }
  });

  it("erases the private repos a removed access covered, and only them", async () => {
    const cache = newVisit();
    await cache.saveContent(PUBLIC, "a1", "public", {
      private: false,
    });
    await cache.saveContent(PRIVATE, "a1", "privé", {
      private: true,
    });
    await cache.saveState(PRIVATE, "HEAD", state(true));
    await cache.saveContent(ELSEWHERE, "a1", "autre organisation", {
      private: true,
    });

    await cache.clearPrivate((repoRef) => repoRef.startsWith("org/"));

    for (const visit of [cache, newVisit()]) {
      expect(await visit.loadContent(PUBLIC, "a1")).toBe("public");
      expect(await visit.loadContent(PRIVATE, "a1")).toBeNull();
      expect(await visit.loadState(PRIVATE, "HEAD")).toBeNull();
      expect(await visit.loadContent(ELSEWHERE, "a1")).toBe(
        "autre organisation",
      );
    }
  });

  it("erases a whole repo when the platform refuses access to it", async () => {
    const cache = newVisit();
    await cache.saveContent(PRIVATE, "a1", "privé", {
      private: true,
    });
    await cache.saveState(PRIVATE, "HEAD", state(true));

    await cache.clearRepo(PRIVATE);

    expect(await newVisit().loadContent(PRIVATE, "a1")).toBeNull();
    expect(await newVisit().loadState(PRIVATE, "HEAD")).toBeNull();
  });

  it("works without storage, for the lifetime of the tab", async () => {
    factory = null;
    const cache = newVisit();
    await cache.saveContent(PUBLIC, "a1", "mémoire", {
      private: false,
    });

    expect(await cache.loadContent(PUBLIC, "a1")).toBe("mémoire");
    expect(await newVisit().loadContent(PUBLIC, "a1")).toBeNull();
  });
});
