import {
  HttpTestingController,
  type TestRequest,
  provideHttpTesting,
} from "../http/http-testing";
import { inject, provide, resetInjection } from "../injection";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { IDBFactory } from "fake-indexeddb";
import { ProjectIdentityService } from "./project-identity.service";
import { INDEXEDDB_FACTORY } from "./content-cache";
import { TokenService } from "../github/token.service";

/**
 * RG-lecture-identite: the identity of each proposed project is read for
 * the home page, kept on the machine, and asked again conditionally. Signed
 * in, under the project's access; without sign-in, through the uncounted
 * channel. That of a private repo disappears with the access that read it.
 *
 * Each case can play several visits on the same storage: `newVisit` rebuilds
 * the application, without the tab's memory.
 */
describe("reading a project's identity", () => {
  const REPO = { owner: "org", repo: "projet" };
  const API = "https://api.github.com/repos/org/projet";
  const RAW_ROOT = "https://raw.githubusercontent.com/org/projet/HEAD";
  const RAW = `${RAW_ROOT}/identite`;
  const TOKEN = "ghp_jetonDeTestSuffisammentLong";
  const ROOT_ETAG = '"racine-1"';
  const IDENTITY_SHA = "arbre-identite-1";

  const SVG_LIGHT =
    '<svg xmlns="http://www.w3.org/2000/svg"><rect fill="#123"/></svg>';
  const SVG_DARK =
    '<svg xmlns="http://www.w3.org/2000/svg"><rect fill="#eee"/></svg>';
  const asDataUrl = (svg: string) => `data:image/svg+xml;base64,${btoa(svg)}`;

  /** The played repo's `identite/` directory, name → content. */
  let files: Record<string, string>;
  /** The played repo's configuration, and the name of its identity directory. */
  let config: string;
  let directory: string;
  let factory: IDBFactory | null;
  let http: HttpTestingController;
  let identities: ProjectIdentityService;
  let tokens: TokenService;
  let storage: Record<string, string>;
  /** The addresses requested during the visit, in order. */
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
    config = "schema_version: 1\n";
    directory = "identite";
    factory = new IDBFactory();
    newVisit();
  });

  afterEach(() => http.verify());

  /**
   * Copied into an `ArrayBuffer` of this context: the one `TextEncoder`
   * returns comes from another, and the HTTP simulation refuses it.
   */
  const bytes = (text: string) => {
    const raw = new TextEncoder().encode(text);
    const buffer = new ArrayBuffer(raw.length);
    new Uint8Array(buffer).set(raw);
    return buffer;
  };

  /** Responds like GitHub, with the current `identite/` directory. */
  function github(r: TestRequest, outage?: { status: number }): void {
    requests.push(r);
    const url = r.request.url;
    if (outage) {
      // A zero status is a network down: no response arrived.
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
      if (directory !== "identite") {
        root.push({ name: "rules", path: "rules", type: "dir", sha: "r" });
      }
      if (Object.keys(files).length) {
        root.push({
          name: directory,
          path: directory,
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
    if (url === `${API}/git/blobs/y`) {
      r.flush(bytes(config));
      return;
    }
    if (url === `${RAW_ROOT}/ssk-canon.yml`) {
      r.flush(bytes(config));
      return;
    }
    const blob = url.match(/\/git\/blobs\/blob-(.+)$/);
    if (blob && files[blob[1]] !== undefined) {
      r.flush(bytes(files[blob[1]]));
      return;
    }
    const rawBase = `${RAW_ROOT}/${directory}`;
    const raw = url.startsWith(`${rawBase}/`)
      ? url.slice(rawBase.length + 1)
      : null;
    if (raw !== null && files[raw] !== undefined) {
      r.flush(bytes(files[raw]));
      return;
    }
    r.flush(null, { status: 404, statusText: "Not Found" });
  }

  /** Carries a read through to its end, answering each call. */
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

  describe("signed in", () => {
    beforeEach(() => tokens.set(TOKEN));

    it("reads the symbol through the API, under the project's access, and never through a raw address", async () => {
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

    it("asks again conditionally on return, and fetches nothing unchanged", async () => {
      await replay(identities.request(REPO, "sombre"));

      newVisit();
      tokens.set(TOKEN);
      const read = identities.request(REPO, "sombre");
      // What the machine holds is displayed before the response: the list does
      // not shift while waiting for the network.
      for (let i = 0; i < 20 && !identities.findSymbol(REPO, "sombre"); i++) {
        await new Promise((r) => setTimeout(r, 0));
      }
      expect(identities.findSymbol(REPO, "sombre")).toBe(asDataUrl(SVG_DARK));
      await replay(read);

      expect(urls()).toEqual([`${API}/contents/`]);
      expect(requests[0].request.headers.get("If-None-Match")).toBe(ROOT_ETAG);
      expect(identities.findSymbol(REPO, "sombre")).toBe(asDataUrl(SVG_DARK));
    });

    it("does not download another theme's variant until it is requested", async () => {
      await replay(identities.request(REPO, "clair"));
      expect(urls().some((u) => u.includes("sombre"))).toBe(false);
    });

    it("makes up nothing for a project without an identity", async () => {
      files = {};
      await replay(identities.request(REPO, "clair"));

      expect(identities.findSymbol(REPO, "clair")).toBeNull();
      expect(urls()).toEqual([`${API}/contents/`]);
    });

    it("never uses the other background's variant", async () => {
      files = { "symbole-clair.svg": SVG_LIGHT };
      await replay(identities.request(REPO, "sombre"));

      expect(identities.findSymbol(REPO, "sombre")).toBeNull();
      expect(urls().some((u) => u.includes("/git/blobs/"))).toBe(false);
    });

    it("finds the identity under the name the repo declares, reading the configuration once", async () => {
      // RG-noms-declares: the directory may carry another name.
      config = "dossiers:\n  identite: marque\n";
      directory = "marque";
      await replay(identities.request(REPO, "sombre"));

      expect(identities.findSymbol(REPO, "sombre")).toBe(asDataUrl(SVG_DARK));
      expect(urls()).toEqual([
        `${API}/contents/`,
        `${API}/git/blobs/y`,
        `${API}/git/trees/${IDENTITY_SHA}`,
        `${API}/git/blobs/blob-symbole-sombre.svg`,
      ]);

      // the configuration is designated by its fingerprint: read once
      newVisit();
      tokens.set(TOKEN);
      await replay(identities.request(REPO, "clair"));
      expect(urls()).not.toContain(`${API}/git/blobs/y`);
      expect(identities.findSymbol(REPO, "clair")).toBe(asDataUrl(SVG_LIGHT));
    });

    it("erases the identity with the access that read it", async () => {
      await replay(identities.request(REPO, "sombre"));

      tokens.erase();
      for (let i = 0; i < 20 && identities.findSymbol(REPO, "sombre"); i++) {
        await new Promise((r) => setTimeout(r, 0));
      }
      expect(identities.findSymbol(REPO, "sombre")).toBeNull();

      // Nothing stays on the machine: a new visit without access has nothing to
      // show, and the private repo does not answer the public channel.
      newVisit();
      await replay(identities.request(REPO, "sombre"), (r) =>
        github(r, r.request.url.startsWith(RAW) ? { status: 404 } : undefined),
      );
      expect(identities.findSymbol(REPO, "sombre")).toBeNull();
    });

    it("erases the identity when access is refused", async () => {
      await replay(identities.request(REPO, "sombre"));

      newVisit();
      tokens.set(TOKEN);
      await replay(identities.request(REPO, "sombre"), (r) =>
        github(r, { status: 404 }),
      );

      expect(identities.findSymbol(REPO, "sombre")).toBeNull();
    });

    it("keeps the last known state when GitHub does not respond, without blocking anything", async () => {
      await replay(identities.request(REPO, "sombre"));

      newVisit();
      tokens.set(TOKEN);
      await replay(identities.request(REPO, "sombre"), (r) =>
        github(r, { status: 0 }),
      );

      expect(identities.findSymbol(REPO, "sombre")).toBe(asDataUrl(SVG_DARK));
    });
  });

  describe("without sign-in", () => {
    it("reads through the uncounted channel, by the default branch's name, letting the browser revalidate", async () => {
      await replay(identities.request(REPO, "sombre"));

      expect(identities.findSymbol(REPO, "sombre")).toBe(asDataUrl(SVG_DARK));
      expect(urls()).toEqual([`${RAW}/symbole-sombre.svg`]);
      // raw does not expose its tag to script and refuses the preflight that an
      // `If-None-Match` set by hand would trigger: only the browser's revalidation
      // makes the conditional request.
      expect(requests[0].request.cache).toBe("no-cache");
      expect(requests[0].request.headers.has("Authorization")).toBe(false);
    });

    it("goes down the order of formats, then the unsuffixed version", async () => {
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

    it("never uses the other background's variant", async () => {
      files = { "symbole-clair.svg": SVG_LIGHT };
      await replay(identities.request(REPO, "sombre"));

      expect(identities.findSymbol(REPO, "sombre")).toBeNull();
      expect(urls().some((u) => u.includes("clair"))).toBe(false);
    });

    it("finds the identity under the name the repo declares, after the format's one", async () => {
      config = "dossiers:\n  identite: marque\n";
      directory = "marque";
      await replay(identities.request(REPO, "sombre"));

      expect(identities.findSymbol(REPO, "sombre")).toBe(asDataUrl(SVG_DARK));
      expect(urls().slice(-2)).toEqual([
        `${RAW_ROOT}/ssk-canon.yml`,
        `${RAW_ROOT}/marque/symbole-sombre.svg`,
      ]);
    });

    it("does not query the API, whose anonymous quota counts every response", async () => {
      await replay(identities.request(REPO, "clair"));
      expect(urls().some((u) => u.startsWith("https://api.github.com"))).toBe(
        false,
      );
    });
  });
});
