import { beforeEach, describe, expect, it } from "vitest";
import { IDBFactory } from "fake-indexeddb";
import { inject, provide, resetInjection } from "../injection";
import type { Chiffreur } from "../../plateforme/ports";
import { ContenusCache, EtatConnu, FABRIQUE_INDEXEDDB } from "./contenus-cache";

/**
 * Un chiffreur simulé, réversible sous sa seule clé : il suffit à éprouver que le cache ne range que des scellés, et qu'un scellé ne s'ouvre que sous la clé qui l'a fait. Le vrai chiffrement est éprouvé avec le coffre (`web-scellement.test.ts`).
 */
function chiffreur(cle: string): Chiffreur {
  return {
    seal: async (texte) => `${cle}:${btoa(encodeURIComponent(texte))}`,
    open: async (scelle) =>
      scelle.startsWith(`${cle}:`)
        ? decodeURIComponent(atob(scelle.slice(cle.length + 1)))
        : null,
  };
}

/** Tout ce que le stockage du navigateur garde, d'un bloc, comme le lirait un programme qui ouvre le profil. */
async function brut(fabrique: IDBFactory): Promise<string> {
  const db = await new Promise<IDBDatabase>((fin) => {
    const d = fabrique.open("ssk-canon.cache");
    d.onsuccess = () => fin(d.result);
  });
  const magasins = [...db.objectStoreNames];
  const tout = await Promise.all(
    magasins.map(
      (m) =>
        new Promise<unknown[]>((fin) => {
          const d = db.transaction(m).objectStore(m).getAll();
          d.onsuccess = () => fin(d.result as unknown[]);
        }),
    ),
  );
  db.close();
  return JSON.stringify(tout);
}

/**
 * RG-contenus-prives-au-repos : les contenus d'un dépôt privé sont gardés sous la même forme que le jeton qui les ouvre. Scellé, le jeton ; scellés, les contenus.
 */
describe("les contenus privés sous la clé de la passkey", () => {
  const PRIVE = { owner: "org", repo: "prive" };
  const PUBLIC = { owner: "org", repo: "public" };
  let fabrique: IDBFactory;

  function nouvelleVisite(): ContenusCache {
    resetInjection();
    provide(FABRIQUE_INDEXEDDB, fabrique);
    return inject(ContenusCache);
  }

  function etat(): EtatConnu {
    return {
      commit: "c0mm17",
      etag: '"e1"',
      lu: "2026-10-05T08:00:00.000Z",
      entrees: [{ path: "rules/RG-secrete.md", sha: "a1", type: "blob" }],
      tronque: false,
      prive: true,
    };
  }

  beforeEach(() => {
    fabrique = new IDBFactory();
  });

  it("ne range d’un dépôt privé que des scellés", async () => {
    const cache = nouvelleVisite();
    cache.chiffrerAvec(chiffreur("k1"));
    await cache.saveContenu(PRIVE, "a1", "énoncé confidentiel", {
      prive: true,
      persister: true,
    });
    await cache.saveEtat(PRIVE, "HEAD", etat(), { persister: true });
    const stocke = await brut(fabrique);
    expect(stocke).not.toContain("confidentiel");
    expect(stocke).not.toContain("RG-secrete");
  });

  it("les rouvre à la visite suivante, sous la même clé", async () => {
    const cache = nouvelleVisite();
    cache.chiffrerAvec(chiffreur("k1"));
    await cache.saveContenu(PRIVE, "a1", "énoncé confidentiel", {
      prive: true,
      persister: true,
    });
    await cache.saveEtat(PRIVE, "HEAD", etat(), { persister: true });

    const suivante = nouvelleVisite();
    suivante.chiffrerAvec(chiffreur("k1"));
    expect(await suivante.loadContenu(PRIVE, "a1")).toBe("énoncé confidentiel");
    expect(await suivante.loadEtat(PRIVE, "HEAD")).toMatchObject(etat());
  });

  it("ne les rend pas tant que les jetons sont verrouillés", async () => {
    const cache = nouvelleVisite();
    cache.chiffrerAvec(chiffreur("k1"));
    await cache.saveContenu(PRIVE, "a1", "énoncé confidentiel", {
      prive: true,
      persister: true,
    });

    const suivante = nouvelleVisite();
    suivante.verrouiller();
    expect(await suivante.loadContenu(PRIVE, "a1")).toBeNull();
  });

  it("ne range rien d’un dépôt privé tant que les jetons sont verrouillés", async () => {
    // ni en clair, ce qui défairait la protection, ni scellé, faute de clé
    const cache = nouvelleVisite();
    cache.verrouiller();
    await cache.saveContenu(PRIVE, "a1", "énoncé confidentiel", {
      prive: true,
      persister: true,
    });
    expect(await brut(fabrique)).not.toContain("confidentiel");
    expect(await cache.loadContenu(PRIVE, "a1")).toBe("énoncé confidentiel");
  });

  it("ne rend pas un scellé qu’une autre clé a fait", async () => {
    const cache = nouvelleVisite();
    cache.chiffrerAvec(chiffreur("k1"));
    await cache.saveContenu(PRIVE, "a1", "énoncé confidentiel", {
      prive: true,
      persister: true,
    });
    const suivante = nouvelleVisite();
    suivante.chiffrerAvec(chiffreur("k2"));
    expect(await suivante.loadContenu(PRIVE, "a1")).toBeNull();
  });

  it("garde en clair ce qu’il lit d’un dépôt public", async () => {
    // rien à protéger : le canal public le sert à quiconque
    const cache = nouvelleVisite();
    cache.chiffrerAvec(chiffreur("k1"));
    await cache.saveContenu(PUBLIC, "b2", "énoncé public", {
      prive: false,
      persister: true,
    });
    expect(await brut(fabrique)).toContain("énoncé public");
    expect(await nouvelleVisite().loadContenu(PUBLIC, "b2")).toBe(
      "énoncé public",
    );
  });

  it("efface les scellés d’un dépôt privé avec les autres contenus privés", async () => {
    const cache = nouvelleVisite();
    cache.chiffrerAvec(chiffreur("k1"));
    await cache.saveContenu(PRIVE, "a1", "énoncé confidentiel", {
      prive: true,
      persister: true,
    });
    await cache.clearPrives();
    const suivante = nouvelleVisite();
    suivante.chiffrerAvec(chiffreur("k1"));
    expect(await suivante.loadContenu(PRIVE, "a1")).toBeNull();
  });

  it("revient au clair quand la clé lui est retirée", async () => {
    const cache = nouvelleVisite();
    cache.chiffrerAvec(chiffreur("k1"));
    cache.chiffrerAvec(null);
    await cache.saveContenu(PRIVE, "a1", "énoncé confidentiel", {
      prive: true,
      persister: true,
    });
    expect(await brut(fabrique)).toContain("confidentiel");
  });
});
