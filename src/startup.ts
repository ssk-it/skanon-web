import { createApp } from "vue";
import "@fontsource/roboto/400.css";
import "@fontsource/roboto/500.css";
import "@fontsource/jetbrains-mono/400.css";
import "@fontsource/material-symbols-outlined/400.css";
import App from "./App.vue";
import { TokenService } from "./core/github/token.service";
import { inject, provide } from "./core/injection";
import { deepLinkLocation } from "./core/repo/deep-link";
import { TitleStrategy } from "./core/repo/title.strategy";
import { COMPOSITION, compose } from "./extension/composer";
import type { Extension } from "./extension/extension";
import { PLATFORM } from "./platform/platform-token";
import type { Platform } from "./platform/ports";
import { createAppRouter } from "./router";
import "./styles.css";

/** What a deliverable's composition root chooses: its adapters, and its extensions. */
export interface Root {
  readonly platform: Platform;
  readonly extensions: readonly Extension[];
}

/** Provides the platform and the composition of the extensions; throws on a wrong composition, before anything starts. */
export function provideRoot(root: Root): void {
  const composition = compose(root.extensions);
  provide(PLATFORM, root.platform);
  provide(COMPOSITION, composition);
}

/**
 * Startup, which each root calls (ADR-extensions-commerciales). The platform first, then the tokens: the route guard is what starts reading the repo, and it must start it with the token in hand rather than anonymously.
 */
export async function start(root: Root): Promise<void> {
  provideRoot(root);
  await inject(TokenService).initialize();

  const router = createAppRouter();
  // The title carries the project and the item being viewed: without them, history lines up identical entries for different pages.
  inject(TitleStrategy).attach(router);
  await inject(PLATFORM).links.listen(
    (link) => void router.push(deepLinkLocation(link)),
  );

  createApp(App).use(router).mount("#app");
}
