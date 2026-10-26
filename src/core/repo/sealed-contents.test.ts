import { beforeEach, describe, expect, it } from "vitest";
import { IDBFactory } from "fake-indexeddb";
import { inject, provide, resetInjection } from "../injection";
import type { Cipher } from "../../platform/ports";
import { ContentCache, KnownState, INDEXEDDB_FACTORY } from "./content-cache";

/**
 * Un chiffreur simulé, réversible sous sa seule clé : il suffit à éprouver que le cache ne range que des scellés, et qu'un scellé ne s'ouvre que sous la clé qui l'a fait. Le vrai chiffrement est éprouvé avec le coffre (`web-scellement.test.ts`).
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

/** Tout ce que le stockage du navigateur garde, d'un bloc, comme le lirait un programme qui ouvre le profil. */
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
 * RG-contenus-prives-au-repos : les contenus d'un dépôt privé sont gardés sous la même forme que le jeton qui les ouvre. Scellé, le jeton ; scellés, les contenus.
 */
describe("les contenus privés sous la clé de la passkey", () => {
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

  it("ne range d’un dépôt privé que des scellés", async () => {
    const cache = newVisit();
    cache.encryptWith(cipher("k1"));
    await cache.saveContent(PRIVATE, "a1", "énoncé confidentiel", {
      private: true,
      persist: true,
    });
    await cache.saveState(PRIVATE, "HEAD", state(), { persist: true });
    const stored = await raw(factory);
    expect(stored).not.toContain("confidentiel");
    expect(stored).not.toContain("RG-secrete");
  });

  it("les rouvre à la visite suivante, sous la même clé", async () => {
    const cache = newVisit();
    cache.encryptWith(cipher("k1"));
    await cache.saveContent(PRIVATE, "a1", "énoncé confidentiel", {
      private: true,
      persist: true,
    });
    await cache.saveState(PRIVATE, "HEAD", state(), { persist: true });

    const next = newVisit();
    next.encryptWith(cipher("k1"));
    expect(await next.loadContent(PRIVATE, "a1")).toBe("énoncé confidentiel");
    expect(await next.loadState(PRIVATE, "HEAD")).toMatchObject(state());
  });

  it("ne les rend pas tant que les jetons sont verrouillés", async () => {
    const cache = newVisit();
    cache.encryptWith(cipher("k1"));
    await cache.saveContent(PRIVATE, "a1", "énoncé confidentiel", {
      private: true,
      persist: true,
    });

    const next = newVisit();
    next.lock();
    expect(await next.loadContent(PRIVATE, "a1")).toBeNull();
  });

  it("ne range rien d’un dépôt privé tant que les jetons sont verrouillés", async () => {
    // ni en clair, ce qui défairait la protection, ni scellé, faute de clé
    const cache = newVisit();
    cache.lock();
    await cache.saveContent(PRIVATE, "a1", "énoncé confidentiel", {
      private: true,
      persist: true,
    });
    expect(await raw(factory)).not.toContain("confidentiel");
    expect(await cache.loadContent(PRIVATE, "a1")).toBe("énoncé confidentiel");
  });

  it("ne rend pas un scellé qu’une autre clé a fait", async () => {
    const cache = newVisit();
    cache.encryptWith(cipher("k1"));
    await cache.saveContent(PRIVATE, "a1", "énoncé confidentiel", {
      private: true,
      persist: true,
    });
    const next = newVisit();
    next.encryptWith(cipher("k2"));
    expect(await next.loadContent(PRIVATE, "a1")).toBeNull();
  });

  it("garde en clair ce qu’il lit d’un dépôt public", async () => {
    // rien à protéger : le canal public le sert à quiconque
    const cache = newVisit();
    cache.encryptWith(cipher("k1"));
    await cache.saveContent(PUBLIC, "b2", "énoncé public", {
      private: false,
      persist: true,
    });
    expect(await raw(factory)).toContain("énoncé public");
    expect(await newVisit().loadContent(PUBLIC, "b2")).toBe("énoncé public");
  });

  it("efface les scellés d’un dépôt privé avec les autres contenus privés", async () => {
    const cache = newVisit();
    cache.encryptWith(cipher("k1"));
    await cache.saveContent(PRIVATE, "a1", "énoncé confidentiel", {
      private: true,
      persist: true,
    });
    await cache.clearPrivate();
    const next = newVisit();
    next.encryptWith(cipher("k1"));
    expect(await next.loadContent(PRIVATE, "a1")).toBeNull();
  });

  it("revient au clair quand la clé lui est retirée", async () => {
    const cache = newVisit();
    cache.encryptWith(cipher("k1"));
    cache.encryptWith(null);
    await cache.saveContent(PRIVATE, "a1", "énoncé confidentiel", {
      private: true,
      persist: true,
    });
    expect(await raw(factory)).toContain("confidentiel");
  });
});
