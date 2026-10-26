/// <reference types="vitest/config" />
import { defineConfig, searchForWorkspaceRoot } from "vite";
import vue from "@vitejs/plugin-vue";
import { playwright } from "@vitest/browser-playwright";
import { execFileSync } from "node:child_process";
import process from "node:process";
import { pwa } from "./tools/pwa/pwa";

/**
 * The built commit, which the bottom bar shows as the site's version. GitHub Actions' one first, which designates what was asked to be deployed; otherwise the working copy's. A build outside a repo has no version to tell, and must not fail for all that.
 */
function builtCommit(): string {
  const sha = process.env.GITHUB_SHA;
  if (sha) return sha.slice(0, 7);
  try {
    return execFileSync("git", ["rev-parse", "--short=7", "HEAD"], {
      encoding: "utf8",
      stdio: ["ignore", "pipe", "ignore"],
    }).trim();
  } catch {
    return "développement";
  }
}

/**
 * The static web version (`pnpm build:web`, in `dist-web/`), served by any file hosting, from its composition root `src/main.ts`. The desktop application, which lives in a private repo, builds this same code from its own root, with its own configuration.
 */
export default defineConfig({
  plugins: [vue(), pwa()],
  define: {
    "import.meta.env.VITE_TARGET": JSON.stringify("web"),
    "import.meta.env.VITE_VERSION": JSON.stringify(builtCommit()),
  },

  server: {
    port: 1430,
    strictPort: true,
    // Under pnpm's global store, `node_modules` leads outside the repo: without this, the server refuses to serve a font from there (403), which goes missing with no visible error.
    fs: { allow: [searchForWorkspaceRoot(process.cwd()), "../.."] },
  },

  build: {
    outDir: "dist-web",
    // Small images inlined as `data:` would be refused by a `default-src 'self'` content security policy, like the desktop application's.
    assetsInlineLimit: 0,
    target: "es2022",
  },

  test: {
    // `pnpm test:coverage`: the jsdom tests' coverage, which CI hands to SonarCloud. The four browser tests stay out of it — they check layout, not lines.
    coverage: {
      provider: "v8",
      reporter: ["lcov", "text-summary"],
      include: ["src/**"],
      exclude: ["src/**/*.test.ts"],
    },
    projects: [
      {
        extends: true,
        test: {
          name: "jsdom",
          environment: "jsdom",
          include: ["src/**/*.test.ts"],
          exclude: ["src/**/*.browser.test.ts"],
          setupFiles: ["src/test-setup.ts"],
          // The first test of a file pays for the cold import of what it mounts — a page, its routes, sometimes Mermaid —, and the suite runs in parallel: under that load, this first import exceeded the default 5 s (observed one time in ten). A test slow for another reason stays bounded.
          testTimeout: 15_000,
        },
      },
      /**
       * What jsdom does not lay out — layout, scrolling, fonts —, in the engine closest to WKWebView, without a window: Playwright's WebKit, headless.
       */
      {
        extends: true,
        test: {
          name: "browser",
          include: ["src/**/*.browser.test.ts"],
          api: { strictPort: false },
          browser: {
            enabled: true,
            headless: true,
            provider: playwright(),
            instances: [{ browser: "webkit" }],
          },
        },
      },
    ],
  },
});
