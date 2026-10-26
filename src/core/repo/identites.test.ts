import {
  HttpTestingController,
  type TestRequest,
  provideHttpTesting,
} from "../http/http-testing";
import { inject, provide, resetInjection } from "../injection";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { IDBFactory } from "fake-indexeddb";
import { IdentitesService } from "./identites.service";
import { FABRIQUE_INDEXEDDB } from "./contenus-cache";
import { TokenService } from "../github/token.service";

/**
 * RG-lecture-identite : l'identité de chaque projet proposé est lue pour
 * l'accueil, conservée sur le poste, et redemandée sous condition. Connecté,
 * sous l'accès du projet ; sans connexion, par le canal non décompté. Celle
 * d'un dépôt privé disparaît avec l'accès qui l'a lue.
 *
 * Chaque cas peut jouer plusieurs visites sur le même stockage :
 * `nouvelleVisite` reconstruit l'application, sans la mémoire de l'onglet.
 */
describe("lecture de l’identité d’un projet", () => {
  const DEPOT = { owner: "org", repo: "projet" };
  const API = "https://api.github.com/repos/org/projet";
  const RAW = "https://raw.githubusercontent.com/org/projet/HEAD/identite";
  const JETON = "ghp_jetonDeTestSuffisammentLong";
  const ETAG_RACINE = '"racine-1"';
  const SHA_IDENTITE = "arbre-identite-1";

  const SVG_CLAIR =
    '<svg xmlns="http://www.w3.org/2000/svg"><rect fill="#123"/></svg>';
  const SVG_SOMBRE =
    '<svg xmlns="http://www.w3.org/2000/svg"><rect fill="#eee"/></svg>';
  const enDataUrl = (svg: string) => `data:image/svg+xml;base64,${btoa(svg)}`;

  /** Le répertoire `identite/` du dépôt joué, nom → contenu. */
  let fichiers: Record<string, string>;
  let fabrique: IDBFactory | null;
  let http: HttpTestingController;
  let identites: IdentitesService;
  let tokens: TokenService;
  let stockage: Record<string, string>;
  /** Les adresses demandées pendant la visite, dans l'ordre. */
  let demandes: TestRequest[];

  function nouvelleVisite(): void {
    resetInjection();
    provide(FABRIQUE_INDEXEDDB, fabrique);
    http = provideHttpTesting();
    tokens = inject(TokenService);
    identites = inject(IdentitesService);
    demandes = [];
  }

  beforeEach(() => {
    stockage = {};
    Object.defineProperty(globalThis, "localStorage", {
      configurable: true,
      value: {
        getItem: (c: string) => stockage[c] ?? null,
        setItem: (c: string, v: string) => void (stockage[c] = v),
        removeItem: (c: string) => void delete stockage[c],
        clear: () => void (stockage = {}),
      },
    });
    fichiers = {
      "symbole-clair.svg": SVG_CLAIR,
      "symbole-sombre.svg": SVG_SOMBRE,
    };
    fabrique = new IDBFactory();
    nouvelleVisite();
  });

  afterEach(() => http.verify());

  /**
   * Copié dans un `ArrayBuffer` de ce contexte : celui que rend `TextEncoder`
   * vient d'un autre, et la simulation HTTP le refuse.
   */
  const octets = (texte: string) => {
    const brut = new TextEncoder().encode(texte);
    const tampon = new ArrayBuffer(brut.length);
    new Uint8Array(tampon).set(brut);
    return tampon;
  };

  /** Répond comme GitHub, avec le répertoire `identite/` courant. */
  function github(r: TestRequest, panne?: { statut: number }): void {
    demandes.push(r);
    const url = r.request.url;
    if (panne) {
      // Un statut nul est un réseau coupé : aucune réponse n'est arrivée.
      if (panne.statut === 0) r.error(new ProgressEvent("error"));
      else r.flush(null, { status: panne.statut, statusText: "panne" });
      return;
    }
    if (url === `${API}/contents/`) {
      if (r.request.headers.get("If-None-Match") === ETAG_RACINE) {
        r.flush(null, { status: 304, statusText: "Not Modified" });
        return;
      }
      const racine = [
        {
          name: "ssk-canon.yml",
          path: "ssk-canon.yml",
          type: "file",
          sha: "y",
        },
      ];
      if (Object.keys(fichiers).length) {
        racine.push({
          name: "identite",
          path: "identite",
          type: "dir",
          sha: SHA_IDENTITE,
        });
      }
      r.flush(racine, { headers: { ETag: ETAG_RACINE } });
      return;
    }
    if (url === `${API}/git/trees/${SHA_IDENTITE}`) {
      r.flush({
        sha: SHA_IDENTITE,
        tree: Object.entries(fichiers).map(([path, contenu]) => ({
          path,
          type: "blob",
          sha: `blob-${path}`,
          size: contenu.length,
        })),
      });
      return;
    }
    const blob = url.match(/\/git\/blobs\/blob-(.+)$/);
    if (blob && fichiers[blob[1]] !== undefined) {
      r.flush(octets(fichiers[blob[1]]));
      return;
    }
    const brut = url.startsWith(`${RAW}/`) ? url.slice(RAW.length + 1) : null;
    if (brut !== null && fichiers[brut] !== undefined) {
      r.flush(octets(fichiers[brut]));
      return;
    }
    r.flush(null, { status: 404, statusText: "Not Found" });
  }

  /** Mène une lecture à son terme, en répondant à chaque appel. */
  async function jouer(
    lecture: Promise<void>,
    repondre: (r: TestRequest) => void = (r) => github(r),
  ): Promise<void> {
    let fini = false;
    void lecture.then(() => (fini = true));
    for (let tour = 0; tour < 200 && !fini; tour++) {
      for (const r of http.match(() => true)) repondre(r);
      await new Promise((r) => setTimeout(r, 0));
    }
    await lecture;
  }

  const urls = () => demandes.map((r) => r.request.url);

  describe("connecté", () => {
    beforeEach(() => tokens.definir(JETON));

    it("lit le symbole par l’API, sous l’accès du projet, et jamais par une adresse brute", async () => {
      await jouer(identites.demander(DEPOT, "sombre"));

      expect(identites.findSymbole(DEPOT, "sombre")).toBe(
        enDataUrl(SVG_SOMBRE),
      );
      expect(urls()).toEqual([
        `${API}/contents/`,
        `${API}/git/trees/${SHA_IDENTITE}`,
        `${API}/git/blobs/blob-symbole-sombre.svg`,
      ]);
      for (const r of demandes) {
        expect(r.request.headers.get("Authorization")).toBe(`Bearer ${JETON}`);
      }
    });

    it("redemande sous condition au retour, et ne rapatrie rien d’inchangé", async () => {
      await jouer(identites.demander(DEPOT, "sombre"));

      nouvelleVisite();
      tokens.definir(JETON);
      const lecture = identites.demander(DEPOT, "sombre");
      // Ce que le poste détient s'affiche avant la réponse : la liste ne se
      // décale pas en attendant le réseau.
      for (let i = 0; i < 20 && !identites.findSymbole(DEPOT, "sombre"); i++) {
        await new Promise((r) => setTimeout(r, 0));
      }
      expect(identites.findSymbole(DEPOT, "sombre")).toBe(
        enDataUrl(SVG_SOMBRE),
      );
      await jouer(lecture);

      expect(urls()).toEqual([`${API}/contents/`]);
      expect(demandes[0].request.headers.get("If-None-Match")).toBe(
        ETAG_RACINE,
      );
      expect(identites.findSymbole(DEPOT, "sombre")).toBe(
        enDataUrl(SVG_SOMBRE),
      );
    });

    it("ne télécharge pas la variante d’un autre thème tant qu’elle n’est pas demandée", async () => {
      await jouer(identites.demander(DEPOT, "clair"));
      expect(urls().some((u) => u.includes("sombre"))).toBe(false);
    });

    it("ne fabrique rien pour un projet sans identité", async () => {
      fichiers = {};
      await jouer(identites.demander(DEPOT, "clair"));

      expect(identites.findSymbole(DEPOT, "clair")).toBeNull();
      expect(urls()).toEqual([`${API}/contents/`]);
    });

    it("n’emploie jamais la variante de l’autre fond", async () => {
      fichiers = { "symbole-clair.svg": SVG_CLAIR };
      await jouer(identites.demander(DEPOT, "sombre"));

      expect(identites.findSymbole(DEPOT, "sombre")).toBeNull();
      expect(urls().some((u) => u.includes("/git/blobs/"))).toBe(false);
    });

    it("efface l’identité avec l’accès qui l’a lue", async () => {
      await jouer(identites.demander(DEPOT, "sombre"));

      tokens.effacer();
      for (let i = 0; i < 20 && identites.findSymbole(DEPOT, "sombre"); i++) {
        await new Promise((r) => setTimeout(r, 0));
      }
      expect(identites.findSymbole(DEPOT, "sombre")).toBeNull();

      // Rien ne reste sur le poste : une nouvelle visite sans accès n'a rien à
      // montrer, et le dépôt privé ne répond pas au canal public.
      nouvelleVisite();
      await jouer(identites.demander(DEPOT, "sombre"), (r) =>
        github(r, r.request.url.startsWith(RAW) ? { statut: 404 } : undefined),
      );
      expect(identites.findSymbole(DEPOT, "sombre")).toBeNull();
    });

    it("efface l’identité quand l’accès est refusé", async () => {
      await jouer(identites.demander(DEPOT, "sombre"));

      nouvelleVisite();
      tokens.definir(JETON);
      await jouer(identites.demander(DEPOT, "sombre"), (r) =>
        github(r, { statut: 404 }),
      );

      expect(identites.findSymbole(DEPOT, "sombre")).toBeNull();
    });

    it("garde le dernier état connu quand GitHub ne répond pas, sans rien bloquer", async () => {
      await jouer(identites.demander(DEPOT, "sombre"));

      nouvelleVisite();
      tokens.definir(JETON);
      await jouer(identites.demander(DEPOT, "sombre"), (r) =>
        github(r, { statut: 0 }),
      );

      expect(identites.findSymbole(DEPOT, "sombre")).toBe(
        enDataUrl(SVG_SOMBRE),
      );
    });
  });

  describe("sans connexion", () => {
    it("lit par le canal non décompté, au nom de la branche par défaut, en laissant le navigateur revalider", async () => {
      await jouer(identites.demander(DEPOT, "sombre"));

      expect(identites.findSymbole(DEPOT, "sombre")).toBe(
        enDataUrl(SVG_SOMBRE),
      );
      expect(urls()).toEqual([`${RAW}/symbole-sombre.svg`]);
      // raw n'expose pas sa marque au script et refuse la pré-requête qu'un
      // `If-None-Match` posé à la main déclencherait : seule la revalidation du
      // navigateur fait la requête conditionnelle.
      expect(demandes[0].request.cache).toBe("no-cache");
      expect(demandes[0].request.headers.has("Authorization")).toBe(false);
    });

    it("descend l’ordre des formats, puis la version sans suffixe", async () => {
      fichiers = { "symbole.png": "png", "symbole-clair.svg": SVG_CLAIR };
      await jouer(identites.demander(DEPOT, "sombre"));

      expect(identites.findSymbole(DEPOT, "sombre")).toBe(
        `data:image/png;base64,${btoa("png")}`,
      );
      expect(urls()).toEqual([
        `${RAW}/symbole-sombre.svg`,
        `${RAW}/symbole-sombre.webp`,
        `${RAW}/symbole-sombre.png`,
        `${RAW}/symbole.svg`,
        `${RAW}/symbole.webp`,
        `${RAW}/symbole.png`,
      ]);
    });

    it("n’emploie jamais la variante de l’autre fond", async () => {
      fichiers = { "symbole-clair.svg": SVG_CLAIR };
      await jouer(identites.demander(DEPOT, "sombre"));

      expect(identites.findSymbole(DEPOT, "sombre")).toBeNull();
      expect(urls().some((u) => u.includes("clair"))).toBe(false);
    });

    it("n’interroge pas l’API, dont le quota anonyme compte chaque réponse", async () => {
      await jouer(identites.demander(DEPOT, "clair"));
      expect(urls().some((u) => u.startsWith("https://api.github.com"))).toBe(
        false,
      );
    });
  });
});
