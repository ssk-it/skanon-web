import { inject, provide, resetInjection } from "../injection";
import { beforeEach, describe, expect, it } from "vitest";
import { IDBFactory } from "fake-indexeddb";
import { ContenusCache, EtatConnu, FABRIQUE_INDEXEDDB } from "./contenus-cache";

/**
 * RG-contenus-par-empreinte, RG-contenus-prives-au-repos.
 *
 * Chaque cas ouvre deux instances sur le même stockage : la seconde joue la
 * visite suivante, qui n'a plus la mémoire de l'onglet.
 */
describe("cache des contenus", () => {
  const PUBLIC = { owner: "Org", repo: "Public" };
  const PRIVE = { owner: "org", repo: "prive" };
  const AILLEURS = { owner: "autre", repo: "prive" };

  let fabrique: IDBFactory | null;

  function nouvelleVisite(): ContenusCache {
    resetInjection();
    provide(FABRIQUE_INDEXEDDB, fabrique);
    return inject(ContenusCache);
  }

  function etat(prive: boolean): EtatConnu {
    return {
      commit: "c0mm17",
      etag: '"e1"',
      lu: "2026-10-05T08:00:00.000Z",
      entrees: [{ path: "rules/RG-a.md", sha: "a1", type: "blob" }],
      tronque: false,
      prive,
    };
  }

  beforeEach(() => {
    fabrique = new IDBFactory();
  });

  it("resservit un contenu à la visite suivante, sous son empreinte", async () => {
    await nouvelleVisite().saveContenu(PUBLIC, "a1", "un énoncé", {
      prive: false,
      persister: true,
    });

    const suivante = nouvelleVisite();
    expect(await suivante.loadContenu(PUBLIC, "a1")).toBe("un énoncé");
    expect(await suivante.loadContenu(PUBLIC, "b2")).toBeNull();
  });

  it("ne confond pas deux dépôts, quelle que soit la casse du nom", async () => {
    const cache = nouvelleVisite();
    await cache.saveContenu(PUBLIC, "a1", "public", {
      prive: false,
      persister: true,
    });

    expect(
      await nouvelleVisite().loadContenu(
        { owner: "org", repo: "public" },
        "a1",
      ),
    ).toBe("public");
    expect(await nouvelleVisite().loadContenu(PRIVE, "a1")).toBeNull();
  });

  it("garde en mémoire seulement ce qui ne doit pas survivre à la session", async () => {
    const cache = nouvelleVisite();
    await cache.saveContenu(PRIVE, "a1", "secret", {
      prive: true,
      persister: false,
    });

    expect(await cache.loadContenu(PRIVE, "a1")).toBe("secret");
    expect(await nouvelleVisite().loadContenu(PRIVE, "a1")).toBeNull();
  });

  it("conserve le dernier état lu de chaque branche", async () => {
    await nouvelleVisite().saveEtat(PUBLIC, "HEAD", etat(false), {
      persister: true,
    });

    const relu = await nouvelleVisite().loadEtat(PUBLIC, "HEAD");
    expect(relu?.commit).toBe("c0mm17");
    expect(relu?.entrees).toEqual(etat(false).entrees);
    expect(
      await nouvelleVisite().loadEtat(PUBLIC, "cadrage-2026-001"),
    ).toBeNull();
  });

  it("retire ce qu’aucune arborescence lue ne cite plus, et les branches fermées", async () => {
    const cache = nouvelleVisite();
    for (const sha of ["a1", "b2", "c3"]) {
      await cache.saveContenu(PUBLIC, sha, sha, {
        prive: false,
        persister: true,
      });
    }
    await cache.saveContenu(PRIVE, "c3", "autre dépôt", {
      prive: true,
      persister: true,
    });
    await cache.saveEtat(PUBLIC, "HEAD", etat(false), { persister: true });
    await cache.saveEtat(PUBLIC, "cadrage-2026-001", etat(false), {
      persister: true,
    });

    await cache.pruneDepot(PUBLIC, new Set(["a1", "b2"]), new Set(["HEAD"]));

    for (const visite of [cache, nouvelleVisite()]) {
      expect(await visite.loadContenu(PUBLIC, "a1")).toBe("a1");
      expect(await visite.loadContenu(PUBLIC, "c3")).toBeNull();
      expect(await visite.loadContenu(PRIVE, "c3")).toBe("autre dépôt");
      expect(await visite.loadEtat(PUBLIC, "HEAD")).not.toBeNull();
      expect(await visite.loadEtat(PUBLIC, "cadrage-2026-001")).toBeNull();
    }
  });

  it("efface les dépôts privés qu’un accès retiré couvrait, et eux seuls", async () => {
    const cache = nouvelleVisite();
    await cache.saveContenu(PUBLIC, "a1", "public", {
      prive: false,
      persister: true,
    });
    await cache.saveContenu(PRIVE, "a1", "privé", {
      prive: true,
      persister: true,
    });
    await cache.saveEtat(PRIVE, "HEAD", etat(true), { persister: true });
    await cache.saveContenu(AILLEURS, "a1", "autre organisation", {
      prive: true,
      persister: true,
    });

    await cache.clearPrives((depot) => depot.startsWith("org/"));

    for (const visite of [cache, nouvelleVisite()]) {
      expect(await visite.loadContenu(PUBLIC, "a1")).toBe("public");
      expect(await visite.loadContenu(PRIVE, "a1")).toBeNull();
      expect(await visite.loadEtat(PRIVE, "HEAD")).toBeNull();
      expect(await visite.loadContenu(AILLEURS, "a1")).toBe(
        "autre organisation",
      );
    }
  });

  it("efface tout un dépôt quand la plateforme en refuse l’accès", async () => {
    const cache = nouvelleVisite();
    await cache.saveContenu(PRIVE, "a1", "privé", {
      prive: true,
      persister: true,
    });
    await cache.saveEtat(PRIVE, "HEAD", etat(true), { persister: true });

    await cache.clearDepot(PRIVE);

    expect(await nouvelleVisite().loadContenu(PRIVE, "a1")).toBeNull();
    expect(await nouvelleVisite().loadEtat(PRIVE, "HEAD")).toBeNull();
  });

  it("fonctionne sans stockage, le temps de l’onglet", async () => {
    fabrique = null;
    const cache = nouvelleVisite();
    await cache.saveContenu(PUBLIC, "a1", "mémoire", {
      prive: false,
      persister: true,
    });

    expect(await cache.loadContenu(PUBLIC, "a1")).toBe("mémoire");
    expect(await nouvelleVisite().loadContenu(PUBLIC, "a1")).toBeNull();
  });
});
