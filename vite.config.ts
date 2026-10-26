/// <reference types="vitest/config" />
import { defineConfig, searchForWorkspaceRoot } from "vite";
import vue from "@vitejs/plugin-vue";
import { playwright } from "@vitest/browser-playwright";
import { execFileSync } from "node:child_process";
import process from "node:process";
import { pwa } from "./tools/pwa/pwa";

/**
 * Le commit construit, que la barre du bas affiche comme version du site. Celui de GitHub Actions d'abord, qui désigne ce qu'on a demandé de déployer ; sinon celui de la copie de travail. Une construction hors d'un dépôt n'a pas de version à dire, et ne doit pas échouer pour autant.
 */
function commitConstruit(): string {
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
 * La version web statique (`pnpm build:web`, dans `dist-web/`), servie par n'importe quel hébergement de fichiers, depuis sa racine de composition `src/main.ts`. L'application de bureau, qui vit dans un dépôt privé, construit ce même code depuis sa propre racine, avec sa propre configuration.
 */
export default defineConfig({
  plugins: [vue(), pwa()],
  define: {
    "import.meta.env.VITE_CIBLE": JSON.stringify("web"),
    "import.meta.env.VITE_VERSION": JSON.stringify(commitConstruit()),
  },

  server: {
    port: 1430,
    strictPort: true,
    // Sous le magasin global de pnpm, `node_modules` mène hors du dépôt : sans cela, le serveur refuse d'y servir une police (403), qui manque sans erreur visible.
    fs: { allow: [searchForWorkspaceRoot(process.cwd()), "../.."] },
  },

  build: {
    outDir: "dist-web",
    // Les petites images intégrées en `data:` seraient refusées par une politique de sécurité du contenu `default-src 'self'`, comme celle de l'application de bureau.
    assetsInlineLimit: 0,
    target: "es2022",
  },

  test: {
    projects: [
      {
        extends: true,
        test: {
          name: "jsdom",
          environment: "jsdom",
          include: ["src/**/*.test.ts"],
          exclude: ["src/**/*.browser.test.ts"],
          setupFiles: ["src/test-setup.ts"],
          // Le premier test d'un fichier paie l'import à froid de ce qu'il monte — une page, ses routes, parfois Mermaid —, et la suite tourne en parallèle : sous cette charge, ce premier import dépassait les 5 s par défaut (constaté une fois sur dix). Un test lent pour une autre raison reste borné.
          testTimeout: 15_000,
        },
      },
      /**
       * Ce que jsdom ne met pas en page — disposition, défilement, polices —, dans le moteur le plus proche de WKWebView, sans fenêtre : WebKit de Playwright, sans tête.
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
