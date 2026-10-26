import { createApp } from "vue";
import "@fontsource/roboto/400.css";
import "@fontsource/roboto/500.css";
import "@fontsource/jetbrains-mono/400.css";
import "@fontsource/material-symbols-outlined/400.css";
import App from "./App.vue";
import { TokenService } from "./core/github/token.service";
import { inject, provide } from "./core/injection";
import { TitleStrategy } from "./core/repo/titre.strategy";
import { COMPOSITION, compose } from "./extension/composer";
import type { Extension } from "./extension/extension";
import { PLATFORM } from "./plateforme/jeton";
import type { Platform } from "./plateforme/ports";
import { createAppRouter } from "./routeur";
import "./styles.css";

/** Ce que la racine de composition d'un livrable choisit : ses adaptateurs, et ses extensions. */
export interface Root {
  readonly platform: Platform;
  readonly extensions: readonly Extension[];
}

/** Fournit la plateforme et la composition des extensions ; lève sur une composition fausse, avant que rien ne démarre. */
export function provideRoot(root: Root): void {
  const composition = compose(root.extensions);
  provide(PLATFORM, root.platform);
  provide(COMPOSITION, composition);
}

/**
 * Le démarrage, que chaque racine appelle (ADR-extensions-commerciales). La plateforme d'abord, puis les jetons : c'est le garde de route qui lance la lecture du dépôt, et il doit la lancer avec le jeton en main plutôt qu'en anonyme.
 */
export async function start(root: Root): Promise<void> {
  provideRoot(root);
  await inject(TokenService).initialize();

  const router = createAppRouter();
  // Le titre porte le projet et l'élément consulté : sans eux, l'historique aligne des entrées identiques pour des pages différentes.
  inject(TitleStrategy).attach(router);
  await inject(PLATFORM).links.listen(
    (link) => void router.push({ path: "/ouvrir", query: { link: link } }),
  );

  createApp(App).use(router).mount("#app");
}
