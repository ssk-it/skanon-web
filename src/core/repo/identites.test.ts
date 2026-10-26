import {
  HttpTestingController,
  type TestRequest,
  provideHttpTesting,
} from "../http/http-testing";
import { inject, provide, resetInjection } from "../injection";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { IDBFactory } from "fake-indexeddb";
import { ProjectIdentityService } from "./identites.service";
import { INDEXEDDB_FACTORY } from "./contenus-cache";
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
  const REPO = { owner: "org", repo: "projet" };
  const API = "https://api.github.com/repos/org/projet";
  const RAW = "https://raw.githubusercontent.com/org/projet/HEAD/identite";
  const TOKEN = "ghp_jetonDeTestSuffisammentLong";
  const ROOT_ETAG = '"racine-1"';
  const IDENTITY_SHA = "arbre-identite-1";

  const SVG_LIGHT =
    '<svg xmlns="http://www.w3.org/2000/svg"><rect fill="#123"/></svg>';
  const SVG_DARK =
    '<svg xmlns="http://www.w3.org/2000/svg"><rect fill="#eee"/></svg>';
  const asDataUrl = (svg: string) => `data:image/svg+xml;base64,${btoa(svg)}`;

  /** Le répertoire `identite/` du dépôt joué, nom → contenu. */
  let files: Record<string, string>;
  let factory: IDBFactory | null;
  let http: HttpTestingController;
  let identities: ProjectIdentityService;
  let tokens: TokenService;
  let storage: Record<string, string>;
  /** Les adresses demandées pendant la visite, dans l'ordre. */
  let requests: TestRequest[];

  function newVisit(): void {
    resetInjection();
    provide(INDEXEDDB_FACTORY, factory);
    http = provideHttpTesting();
    tokens = inject(TokenService);
    identities = inject(ProjectIdentityService);
    requests = [];
  }

  beforeEach(() => {
    storage = {};
    Object.defineProperty(globalThis, "localStorage", {
      configurable: true,
      value: {
        getItem: (c: string) => storage[c] ?? null,
        setItem: (c: string, v: string) => void (storage[c] = v),
        removeItem: (c: string) => void delete storage[c],
        clear: () => void (storage = {}),
      },
    });
    files = {
      "symbole-clair.svg": SVG_LIGHT,
      "symbole-sombre.svg": SVG_DARK,
    };
    factory = new IDBFactory();
    newVisit();
  });

  afterEach(() => http.verify());

  /**
   * Copié dans un `ArrayBuffer` de ce contexte : celui que rend `TextEncoder`
   * vient d'un autre, et la simulation HTTP le refuse.
   */
  const bytes = (text: string) => {
    const raw = new TextEncoder().encode(text);
    const buffer = new ArrayBuffer(raw.length);
    new Uint8Array(buffer).set(raw);
    return buffer;
  };

  /** Répond comme GitHub, avec le répertoire `identite/` courant. */
  function github(r: TestRequest, outage?: { status: number }): void {
    requests.push(r);
    const url = r.request.url;
    if (outage) {
      // Un statut nul est un réseau coupé : aucune réponse n'est arrivée.
      if (outage.status === 0) r.error(new ProgressEvent("error"));
      else r.flush(null, { status: outage.status, statusText: "panne" });
      return;
    }
    if (url === `${API}/contents/`) {
      if (r.request.headers.get("If-None-Match") === ROOT_ETAG) {
        r.flush(null, { status: 304, statusText: "Not Modified" });
        return;
      }
      const root = [
        {
          name: "ssk-canon.yml",
          path: "ssk-canon.yml",
          type: "file",
          sha: "y",
        },
      ];
      if (Object.keys(files).length) {
        root.push({
          name: "identite",
          path: "identite",
          type: "dir",
          sha: IDENTITY_SHA,
        });
      }
      r.flush(root, { headers: { ETag: ROOT_ETAG } });
      return;
    }
    if (url === `${API}/git/trees/${IDENTITY_SHA}`) {
      r.flush({
        sha: IDENTITY_SHA,
        tree: Object.entries(files).map(([path, content]) => ({
          path,
          type: "blob",
          sha: `blob-${path}`,
          size: content.length,
        })),
      });
      return;
    }
    const blob = url.match(/\/git\/blobs\/blob-(.+)$/);
    if (blob && files[blob[1]] !== undefined) {
      r.flush(bytes(files[blob[1]]));
      return;
    }
    const raw = url.startsWith(`${RAW}/`) ? url.slice(RAW.length + 1) : null;
    if (raw !== null && files[raw] !== undefined) {
      r.flush(bytes(files[raw]));
      return;
    }
    r.flush(null, { status: 404, statusText: "Not Found" });
  }

  /** Mène une lecture à son terme, en répondant à chaque appel. */
  async function replay(
    read: Promise<void>,
    respond: (r: TestRequest) => void = (r) => github(r),
  ): Promise<void> {
    let finished = false;
    void read.then(() => (finished = true));
    for (let round = 0; round < 200 && !finished; round++) {
      for (const r of http.match(() => true)) respond(r);
      await new Promise((r) => setTimeout(r, 0));
    }
    await read;
  }

  const urls = () => requests.map((r) => r.request.url);

  describe("connecté", () => {
    beforeEach(() => tokens.set(TOKEN));

    it("lit le symbole par l’API, sous l’accès du projet, et jamais par une adresse brute", async () => {
      await replay(identities.request(REPO, "sombre"));

      expect(identities.findSymbol(REPO, "sombre")).toBe(asDataUrl(SVG_DARK));
      expect(urls()).toEqual([
        `${API}/contents/`,
        `${API}/git/trees/${IDENTITY_SHA}`,
        `${API}/git/blobs/blob-symbole-sombre.svg`,
      ]);
      for (const r of requests) {
        expect(r.request.headers.get("Authorization")).toBe(`Bearer ${TOKEN}`);
      }
    });

    it("redemande sous condition au retour, et ne rapatrie rien d’inchangé", async () => {
      await replay(identities.request(REPO, "sombre"));

      newVisit();
      tokens.set(TOKEN);
      const read = identities.request(REPO, "sombre");
      // Ce que le poste détient s'affiche avant la réponse : la liste ne se
      // décale pas en attendant le réseau.
      for (let i = 0; i < 20 && !identities.findSymbol(REPO, "sombre"); i++) {
        await new Promise((r) => setTimeout(r, 0));
      }
      expect(identities.findSymbol(REPO, "sombre")).toBe(asDataUrl(SVG_DARK));
      await replay(read);

      expect(urls()).toEqual([`${API}/contents/`]);
      expect(requests[0].request.headers.get("If-None-Match")).toBe(ROOT_ETAG);
      expect(identities.findSymbol(REPO, "sombre")).toBe(asDataUrl(SVG_DARK));
    });

    it("ne télécharge pas la variante d’un autre thème tant qu’elle n’est pas demandée", async () => {
      await replay(identities.request(REPO, "clair"));
      expect(urls().some((u) => u.includes("sombre"))).toBe(false);
    });

    it("ne fabrique rien pour un projet sans identité", async () => {
      files = {};
      await replay(identities.request(REPO, "clair"));

      expect(identities.findSymbol(REPO, "clair")).toBeNull();
      expect(urls()).toEqual([`${API}/contents/`]);
    });

    it("n’emploie jamais la variante de l’autre fond", async () => {
      files = { "symbole-clair.svg": SVG_LIGHT };
      await replay(identities.request(REPO, "sombre"));

      expect(identities.findSymbol(REPO, "sombre")).toBeNull();
      expect(urls().some((u) => u.includes("/git/blobs/"))).toBe(false);
    });

    it("efface l’identité avec l’accès qui l’a lue", async () => {
      await replay(identities.request(REPO, "sombre"));

      tokens.erase();
      for (let i = 0; i < 20 && identities.findSymbol(REPO, "sombre"); i++) {
        await new Promise((r) => setTimeout(r, 0));
      }
      expect(identities.findSymbol(REPO, "sombre")).toBeNull();

      // Rien ne reste sur le poste : une nouvelle visite sans accès n'a rien à
      // montrer, et le dépôt privé ne répond pas au canal public.
      newVisit();
      await replay(identities.request(REPO, "sombre"), (r) =>
        github(r, r.request.url.startsWith(RAW) ? { status: 404 } : undefined),
      );
      expect(identities.findSymbol(REPO, "sombre")).toBeNull();
    });

    it("efface l’identité quand l’accès est refusé", async () => {
      await replay(identities.request(REPO, "sombre"));

      newVisit();
      tokens.set(TOKEN);
      await replay(identities.request(REPO, "sombre"), (r) =>
        github(r, { status: 404 }),
      );

      expect(identities.findSymbol(REPO, "sombre")).toBeNull();
    });

    it("garde le dernier état connu quand GitHub ne répond pas, sans rien bloquer", async () => {
      await replay(identities.request(REPO, "sombre"));

      newVisit();
      tokens.set(TOKEN);
      await replay(identities.request(REPO, "sombre"), (r) =>
        github(r, { status: 0 }),
      );

      expect(identities.findSymbol(REPO, "sombre")).toBe(asDataUrl(SVG_DARK));
    });
  });

  describe("sans connexion", () => {
    it("lit par le canal non décompté, au nom de la branche par défaut, en laissant le navigateur revalider", async () => {
      await replay(identities.request(REPO, "sombre"));

      expect(identities.findSymbol(REPO, "sombre")).toBe(asDataUrl(SVG_DARK));
      expect(urls()).toEqual([`${RAW}/symbole-sombre.svg`]);
      // raw n'expose pas sa marque au script et refuse la pré-requête qu'un
      // `If-None-Match` posé à la main déclencherait : seule la revalidation du
      // navigateur fait la requête conditionnelle.
      expect(requests[0].request.cache).toBe("no-cache");
      expect(requests[0].request.headers.has("Authorization")).toBe(false);
    });

    it("descend l’ordre des formats, puis la version sans suffixe", async () => {
      files = { "symbole.png": "png", "symbole-clair.svg": SVG_LIGHT };
      await replay(identities.request(REPO, "sombre"));

      expect(identities.findSymbol(REPO, "sombre")).toBe(
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
      files = { "symbole-clair.svg": SVG_LIGHT };
      await replay(identities.request(REPO, "sombre"));

      expect(identities.findSymbol(REPO, "sombre")).toBeNull();
      expect(urls().some((u) => u.includes("clair"))).toBe(false);
    });

    it("n’interroge pas l’API, dont le quota anonyme compte chaque réponse", async () => {
      await replay(identities.request(REPO, "clair"));
      expect(urls().some((u) => u.startsWith("https://api.github.com"))).toBe(
        false,
      );
    });
  });
});
