import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import type { OutputBundle } from "rollup";
import type { ResolvedConfig } from "vite";
import { pwa } from "./pwa";

/**
 * The plugin that makes the web version installable: what it adds to `index.html`, what it publishes, and the service worker it writes — the list of files to precache, and the fingerprint that tells a new version from the current one.
 *
 * A defect here does not show in development: the precache list misses a file and the application breaks offline, or the fingerprint does not move and nobody is offered the new version. The hooks are called the way Vite calls them, on a bundle and a public folder made for the test.
 */

type Bundle = Record<string, { type: "asset" | "chunk"; source?: string }>;

let publicDir: string;

beforeEach(() => {
  publicDir = mkdtempSync(join(tmpdir(), "skanon-pwa-"));
  writeFileSync(join(publicDir, "logo.svg"), "<svg/>");
  mkdirSync(join(publicDir, "polices"));
  writeFileSync(join(publicDir, "polices", "roboto.woff2"), "police");
  writeFileSync(join(publicDir, ".DS_Store"), "macOS");
});

afterEach(() => rmSync(publicDir, { recursive: true, force: true }));

function aBundle(): Bundle {
  return {
    "index.html": { type: "asset", source: "<html>v1</html>" },
    "assets/index-a1b2c3.js": { type: "chunk" },
    "assets/index-d4e5f6.css": { type: "asset", source: "body{}" },
  };
}

/** Runs the build hooks, and returns what the plugin emitted, by file name. */
function build(bundle: Bundle = aBundle()): Map<string, string> {
  const plugin = pwa();
  (plugin.configResolved as (c: ResolvedConfig) => void)({
    publicDir,
  } as ResolvedConfig);
  const emitted = new Map<string, string>();
  const context = {
    emitFile: (f: { fileName: string; source: Uint8Array }) => {
      emitted.set(f.fileName, new TextDecoder().decode(f.source));
      return f.fileName;
    },
  };
  (plugin.generateBundle as (...args: unknown[]) => void).call(
    context,
    {},
    bundle as unknown as OutputBundle,
    false,
  );
  return emitted;
}

/** The constants the plugin wrote into the service worker. */
function serviceWorker(emitted: Map<string, string>) {
  const sw = emitted.get("sw.js") ?? "";
  const version = /const VERSION = "([^"]*)";/.exec(sw)?.[1];
  const files = /const FICHIERS = (\[[^\n]*\]);/.exec(sw)?.[1];
  return {
    sw,
    version,
    files: files ? (JSON.parse(files) as string[]) : undefined,
  };
}

describe("The PWA plugin", () => {
  it("only applies to the build", () => {
    expect(pwa().apply).toBe("build");
  });

  it("links the manifest, the touch icon and the theme colour from index.html", () => {
    const tags = (pwa().transformIndexHtml as () => unknown)();

    expect(tags).toEqual([
      {
        tag: "link",
        attrs: { rel: "manifest", href: "/manifest.webmanifest" },
        injectTo: "head",
      },
      {
        tag: "link",
        attrs: { rel: "apple-touch-icon", href: "/icons/icon-192x192.png" },
        injectTo: "head",
      },
      {
        tag: "meta",
        attrs: { name: "theme-color", content: "#2f5cff" },
        injectTo: "head",
      },
    ]);
  });

  it("publishes the manifest, the icons, the handover and the service worker", () => {
    const emitted = build();

    expect(emitted.get("manifest.webmanifest")).toContain('"start_url"');
    expect(emitted.has("icons/icon-192x192.png")).toBe(true);
    expect(emitted.get("ngsw-worker.js")).toBeTruthy();
    expect(emitted.has("sw.js")).toBe(true);
  });

  it("fills in both placeholders of the service worker", () => {
    const { sw, version } = serviceWorker(build());

    // The comments of the template name them; the declarations no longer may.
    expect(sw).not.toContain('const VERSION = "__VERSION__";');
    expect(sw).not.toContain("const FICHIERS = __FICHIERS__;");
    expect(version).toMatch(/^[0-9a-f]{16}$/);
  });

  it("precaches the bundle, what it emits and the public files, in code-unit order", () => {
    const { files } = serviceWorker(build());

    const icons = [...build().keys()].filter((f) => f.startsWith("icons/"));
    expect(icons.length).toBeGreaterThan(0);
    expect(files).toEqual(
      [
        "/assets/index-a1b2c3.js",
        "/assets/index-d4e5f6.css",
        ...icons.map((f) => `/${f}`),
        "/index.html",
        "/logo.svg",
        "/manifest.webmanifest",
        "/polices/roboto.woff2",
      ].sort((a, b) => (a < b ? -1 : a > b ? 1 : 0)),
    );
  });

  it("precaches neither itself, nor the handover, nor a hidden file", () => {
    // A service worker already in the bundle — a leftover of a former build — must not precache itself either.
    const bundle = aBundle();
    bundle["sw.js"] = { type: "asset", source: "ancien" };
    const { files } = serviceWorker(build(bundle));

    expect(files).not.toContain("/sw.js");
    expect(files).not.toContain("/ngsw-worker.js");
    expect(files).not.toContain("/.DS_Store");
  });

  describe("fingerprints the version", () => {
    it("the same way for the same build, whatever the bundle's order", () => {
      const reversed = Object.fromEntries(Object.entries(aBundle()).reverse());

      expect(serviceWorker(build(reversed)).version).toBe(
        serviceWorker(build()).version,
      );
    });

    it("anew when index.html changes", () => {
      const before = serviceWorker(build()).version;
      const bundle = aBundle();
      bundle["index.html"].source = "<html>v2</html>";

      expect(serviceWorker(build(bundle)).version).not.toBe(before);
    });

    it("anew when a public file changes", () => {
      const before = serviceWorker(build()).version;
      writeFileSync(join(publicDir, "logo.svg"), "<svg>v2</svg>");

      expect(serviceWorker(build()).version).not.toBe(before);
    });

    it("anew when a script changes name — its name carries its content's fingerprint", () => {
      const before = serviceWorker(build()).version;
      const bundle = aBundle();
      delete bundle["assets/index-a1b2c3.js"];
      bundle["assets/index-ffffff.js"] = { type: "chunk" };

      expect(serviceWorker(build(bundle)).version).not.toBe(before);
    });
  });
});
