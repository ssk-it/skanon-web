import { inject, provide, resetInjection } from "../injection";
import { beforeEach, describe, expect, it } from "vitest";
import { IDBFactory } from "fake-indexeddb";
import { ContentCache, KnownState, INDEXEDDB_FACTORY } from "./content-cache";

/**
 * RG-contenus-par-empreinte, RG-contenus-prives-au-repos.
 *
 * Chaque cas ouvre deux instances sur le même stockage : la seconde joue la
 * visite suivante, qui n'a plus la mémoire de l'onglet.
 */
describe("cache des contenus", () => {
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

  // Les enregistrements de la version 2 portaient des champs aux noms français (`depot`, `contenu`, `prive`) : relus sous les nouveaux noms, ils rendraient des champs absents. Un cache se reconstruit ; on repart de zéro.
  it("repart d'un cache vide sur un poste passé par la version 2", async () => {
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
      persist: true,
    });
    expect(await newVisit().loadContent(PUBLIC, "a1")).toBe("un énoncé");
  });

  it("resservit un contenu à la visite suivante, sous son empreinte", async () => {
    await newVisit().saveContent(PUBLIC, "a1", "un énoncé", {
      private: false,
      persist: true,
    });

    const next = newVisit();
    expect(await next.loadContent(PUBLIC, "a1")).toBe("un énoncé");
    expect(await next.loadContent(PUBLIC, "b2")).toBeNull();
  });

  it("ne confond pas deux dépôts, quelle que soit la casse du nom", async () => {
    const cache = newVisit();
    await cache.saveContent(PUBLIC, "a1", "public", {
      private: false,
      persist: true,
    });

    expect(
      await newVisit().loadContent({ owner: "org", repo: "public" }, "a1"),
    ).toBe("public");
    expect(await newVisit().loadContent(PRIVATE, "a1")).toBeNull();
  });

  it("garde en mémoire seulement ce qui ne doit pas survivre à la session", async () => {
    const cache = newVisit();
    await cache.saveContent(PRIVATE, "a1", "secret", {
      private: true,
      persist: false,
    });

    expect(await cache.loadContent(PRIVATE, "a1")).toBe("secret");
    expect(await newVisit().loadContent(PRIVATE, "a1")).toBeNull();
  });

  it("conserve le dernier état lu de chaque branche", async () => {
    await newVisit().saveState(PUBLIC, "HEAD", state(false), {
      persist: true,
    });

    const reread = await newVisit().loadState(PUBLIC, "HEAD");
    expect(reread?.commit).toBe("c0mm17");
    expect(reread?.entries).toEqual(state(false).entries);
    expect(await newVisit().loadState(PUBLIC, "cadrage-2026-001")).toBeNull();
  });

  it("retire ce qu’aucune arborescence lue ne cite plus, et les branches fermées", async () => {
    const cache = newVisit();
    for (const sha of ["a1", "b2", "c3"]) {
      await cache.saveContent(PUBLIC, sha, sha, {
        private: false,
        persist: true,
      });
    }
    await cache.saveContent(PRIVATE, "c3", "autre dépôt", {
      private: true,
      persist: true,
    });
    await cache.saveState(PUBLIC, "HEAD", state(false), { persist: true });
    await cache.saveState(PUBLIC, "cadrage-2026-001", state(false), {
      persist: true,
    });

    await cache.pruneRepo(PUBLIC, new Set(["a1", "b2"]), new Set(["HEAD"]));

    for (const visit of [cache, newVisit()]) {
      expect(await visit.loadContent(PUBLIC, "a1")).toBe("a1");
      expect(await visit.loadContent(PUBLIC, "c3")).toBeNull();
      expect(await visit.loadContent(PRIVATE, "c3")).toBe("autre dépôt");
      expect(await visit.loadState(PUBLIC, "HEAD")).not.toBeNull();
      expect(await visit.loadState(PUBLIC, "cadrage-2026-001")).toBeNull();
    }
  });

  it("efface les dépôts privés qu’un accès retiré couvrait, et eux seuls", async () => {
    const cache = newVisit();
    await cache.saveContent(PUBLIC, "a1", "public", {
      private: false,
      persist: true,
    });
    await cache.saveContent(PRIVATE, "a1", "privé", {
      private: true,
      persist: true,
    });
    await cache.saveState(PRIVATE, "HEAD", state(true), { persist: true });
    await cache.saveContent(ELSEWHERE, "a1", "autre organisation", {
      private: true,
      persist: true,
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

  it("efface tout un dépôt quand la plateforme en refuse l’accès", async () => {
    const cache = newVisit();
    await cache.saveContent(PRIVATE, "a1", "privé", {
      private: true,
      persist: true,
    });
    await cache.saveState(PRIVATE, "HEAD", state(true), { persist: true });

    await cache.clearRepo(PRIVATE);

    expect(await newVisit().loadContent(PRIVATE, "a1")).toBeNull();
    expect(await newVisit().loadState(PRIVATE, "HEAD")).toBeNull();
  });

  it("fonctionne sans stockage, le temps de l’onglet", async () => {
    factory = null;
    const cache = newVisit();
    await cache.saveContent(PUBLIC, "a1", "mémoire", {
      private: false,
      persist: true,
    });

    expect(await cache.loadContent(PUBLIC, "a1")).toBe("mémoire");
    expect(await newVisit().loadContent(PUBLIC, "a1")).toBeNull();
  });
});
